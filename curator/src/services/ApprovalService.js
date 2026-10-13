import { AuditService } from './AuditService.js';
export class ApprovalService {
    /**
     * Checks if a tool invocation has been approved at any of the 3 scopes:
     * 1. PERMANENT: Persisted on the agent (and not revoked)
     * 2. CONVERSATION: Persisted for this conversation session (and not revoked)
     * 3. ONETIME: Explicitly granted for this request execution context
     */
    static async checkApproval(prisma, params) {
        const { toolName, agentId, conversationId, context } = params;
        // 1. Check PERMANENT scope (Agent + Tool, not revoked)
        if (agentId && prisma?.toolApproval?.findFirst) {
            const permanent = await prisma.toolApproval.findFirst({
                where: {
                    agentId,
                    toolName: { in: [toolName, '*'] },
                    scope: 'PERMANENT',
                    revoked: false,
                },
                orderBy: { createdAt: 'desc' }
            });
            if (permanent) {
                return {
                    approved: true,
                    scope: 'PERMANENT',
                    approvalId: permanent.id,
                    reason: `Tool '${toolName}' is permanently approved for agent '${agentId}'.`
                };
            }
        }
        // 2. Check CONVERSATION scope (Conversation + Tool, not revoked)
        if (conversationId && prisma?.toolApproval?.findFirst) {
            const convApproval = await prisma.toolApproval.findFirst({
                where: {
                    conversationId: typeof conversationId === 'number' ? conversationId : String(conversationId),
                    toolName: { in: [toolName, '*'] },
                    scope: 'CONVERSATION',
                    revoked: false,
                },
                orderBy: { createdAt: 'desc' }
            });
            if (convApproval) {
                return {
                    approved: true,
                    scope: 'CONVERSATION',
                    approvalId: convApproval.id,
                    reason: `Tool '${toolName}' is approved for the current conversation (#${conversationId}).`
                };
            }
        }
        // 3. Check ONETIME scope (on request execution context)
        const currentContext = (context && typeof context === 'object') ? context : {};
        const isOneTimeApproved = currentContext.__humanApproved__ === true ||
            currentContext.confirmed === true ||
            (Array.isArray(currentContext.__approvedTools__) && currentContext.__approvedTools__.includes(toolName));
        if (isOneTimeApproved) {
            return {
                approved: true,
                scope: 'ONETIME',
                reason: `Tool '${toolName}' was granted one-time human approval for this request.`
            };
        }
        return {
            approved: false,
            reason: `Tool '${toolName}' mandates human approval and has not been approved.`
        };
    }
    /**
     * Grants a tool approval with an explicit scope (ONETIME, CONVERSATION, or PERMANENT).
     */
    static async grantApproval(prisma, opts) {
        if (!prisma?.toolApproval?.create) {
            throw new Error('ToolApproval model not available in current database schema.');
        }
        const approval = await prisma.toolApproval.create({
            data: {
                toolName: opts.toolName,
                scope: opts.scope,
                agentId: opts.agentId || null,
                conversationId: opts.conversationId !== undefined && opts.conversationId !== null ? opts.conversationId : null,
                userId: opts.userId || null,
                approvedBy: opts.approvedBy,
                revoked: false,
            }
        });
        await AuditService.log(prisma, {
            entityType: opts.agentId ? 'AGENT' : 'REQUEST',
            entityId: opts.agentId || String(opts.requestId || 'system'),
            action: 'HUMAN_APPROVAL_GRANTED',
            userId: opts.userId || opts.approvedBy,
            agentId: opts.agentId || undefined,
            requestId: opts.requestId || undefined,
            status: 'SUCCESS',
            metadata: {
                tool: opts.toolName,
                scope: opts.scope,
                approvalId: approval.id,
                approvedBy: opts.approvedBy,
            }
        });
        return approval;
    }
    /**
     * Revokes a previously granted approval by ID.
     */
    static async revokeApproval(prisma, approvalId, revokedBy) {
        if (!prisma?.toolApproval?.findUnique) {
            throw new Error('ToolApproval model not available in current database schema.');
        }
        const approval = await prisma.toolApproval.findUnique({
            where: { id: approvalId }
        });
        if (!approval) {
            throw new Error(`Tool approval with id '${approvalId}' not found.`);
        }
        const updated = await prisma.toolApproval.update({
            where: { id: approvalId },
            data: {
                revoked: true,
                revokedAt: new Date(),
                revokedBy,
            }
        });
        await AuditService.log(prisma, {
            entityType: approval.agentId ? 'AGENT' : 'TOOL',
            entityId: approval.agentId || approval.toolName,
            action: 'APPROVAL_REVOKED',
            userId: revokedBy,
            agentId: approval.agentId || undefined,
            status: 'SUCCESS',
            metadata: {
                approvalId,
                tool: approval.toolName,
                scope: approval.scope,
                revokedBy,
            }
        });
        return updated;
    }
    /**
     * Revokes all active permanent approvals for an agent and tool.
     */
    static async revokeAgentToolApproval(prisma, agentId, toolName, revokedBy) {
        if (!prisma?.toolApproval?.findMany)
            return 0;
        const approvals = await prisma.toolApproval.findMany({
            where: {
                agentId,
                toolName: { in: [toolName, '*'] },
                revoked: false,
            }
        });
        if (approvals.length === 0)
            return 0;
        await prisma.toolApproval.updateMany({
            where: {
                id: { in: approvals.map((a) => a.id) }
            },
            data: {
                revoked: true,
                revokedAt: new Date(),
                revokedBy,
            }
        });
        await AuditService.log(prisma, {
            entityType: 'AGENT',
            entityId: agentId,
            action: 'APPROVAL_REVOKED',
            userId: revokedBy,
            agentId,
            status: 'SUCCESS',
            metadata: {
                tool: toolName,
                revokedCount: approvals.length,
                revokedBy,
            }
        });
        return approvals.length;
    }
    /**
     * Lists approvals with optional filtering.
     */
    static async listApprovals(prisma, filter) {
        if (!prisma?.toolApproval?.findMany)
            return [];
        const where = {};
        if (filter?.agentId)
            where.agentId = filter.agentId;
        if (filter?.toolName)
            where.toolName = filter.toolName;
        if (filter?.scope)
            where.scope = filter.scope;
        if (!filter?.includeRevoked)
            where.revoked = false;
        return await prisma.toolApproval.findMany({
            where,
            include: { agent: true },
            orderBy: { createdAt: 'desc' }
        });
    }
}
//# sourceMappingURL=ApprovalService.js.map