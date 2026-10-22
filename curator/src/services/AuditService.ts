import type { PrismaClient } from '@prisma/client';

/**
 * AuditService — audit trail stored as Request/Response rows (no separate AuditLog table).
 *
 * - Executions: every tool call, event and choice is a Request and what happened is its Response
 *   (structured JSON records such as TOOL_BLOCKED, APPROVAL_REQUIRED, EVENT_EMITTED, or tool output).
 * - Core model changes (Agent, Script, Role, Tool approval, ...): `recordModelChange` writes a COMPLETED
 *   Request (origin GRAPHQL/API/...) whose Response is a MODEL_CHANGED record.
 * - Approval grants/revocations are also kept on ToolApproval rows; script content history on ScriptVersion.
 */
export interface AuditEntry {
    id: string;
    entityType: string; // 'AGENT' | 'REQUEST'
    entityId: string;
    action: string;     // structured record type, or 'TOOL_RESULT' / 'RESPONSE'
    userId: string | null;
    agentId: string | null;
    requestId: number | null;
    status: string;     // Request status
    metadata: Record<string, any> | null;
    timestamp: string;
}

function parseRecord(content: unknown): Record<string, any> | null {
    if (typeof content !== 'string') return null;
    try {
        const parsed = JSON.parse(content);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export class AuditService {
    /**
     * Records a change to a Curator core model as a Request + MODEL_CHANGED Response.
     * The actor comes from the authenticated caller (never from client payloads).
     * Uses the actor's conversation in the project (created if missing).
     */
    static async recordModelChange(
        prisma: PrismaClient | any,
        input: {
            entityType: string;
            entityId: string;
            action: string;
            userId: string;
            projectId?: string | null;
            agentId?: string | null;
            changes?: Record<string, any>;
            origin?: 'GRAPHQL' | 'API' | 'CLI' | 'REPL' | 'MCP';
        }
    ): Promise<{ requestId: number } | null> {
        if (!prisma?.request?.create || !prisma?.response?.create || !input.userId) return null;
        const projectId = input.projectId ?? null;
        let conversation = await prisma.conversation.findFirst({ where: { userId: input.userId, projectId } });
        if (!conversation) {
            conversation = await prisma.conversation.create({ data: { userId: input.userId, projectId } });
        }
        const change = {
            entityType: input.entityType,
            entityId: String(input.entityId),
            action: input.action,
            ...(input.changes ? { changes: input.changes } : {}),
        };
        const request = await prisma.request.create({
            data: {
                userId: input.userId,
                projectId,
                conversationId: conversation.id,
                agentId: input.agentId ?? undefined,
                status: 'COMPLETED',
                context: { origin: input.origin ?? 'GRAPHQL', modelChange: change },
            },
        });
        await prisma.response.create({
            data: {
                requestId: request.id,
                conversationId: conversation.id,
                projectId,
                content: JSON.stringify({ type: 'MODEL_CHANGED', ok: true, change }),
            },
        });
        return { requestId: request.id };
    }

    /**
     * Returns audit entries derived from Responses, newest first.
     * `entityType: 'REQUEST'` + `entityId` filters by request id.
     */
    static async getLogs(
        prisma: PrismaClient | any,
        options: { agentId?: string; entityType?: string; entityId?: string; limit?: number } = {}
    ): Promise<AuditEntry[]> {
        if (!prisma?.response?.findMany) return [];
        const requestWhere: any = {};
        if (options.agentId) requestWhere.agentId = options.agentId;
        else if (options.entityType === 'AGENT' && options.entityId) requestWhere.agentId = options.entityId;
        else if (options.entityType === 'REQUEST' && options.entityId) requestWhere.id = Number(options.entityId);

        const responses = await (prisma as any).response.findMany({
            where: Object.keys(requestWhere).length ? { request: requestWhere } : {},
            include: { request: { select: { id: true, agentId: true, userId: true, status: true, toolName: true, ast: true } } },
            orderBy: { createdAt: 'desc' },
            take: options.limit || 50,
        });

        return responses.map((r: any) => {
            const record = parseRecord(r.content);
            const req = r.request || {};
            if (record?.type === 'MODEL_CHANGED' && record.change) {
                return {
                    id: String(r.id),
                    entityType: String(record.change.entityType),
                    entityId: String(record.change.entityId),
                    action: String(record.change.action),
                    userId: req.userId ?? null,
                    agentId: req.agentId ?? null,
                    requestId: req.id ?? r.requestId ?? null,
                    status: 'SUCCESS',
                    metadata: record.change.changes ?? null,
                    timestamp: new Date(r.createdAt).toISOString(),
                };
            }
            const tool = record?.tool ?? req.toolName ?? (req.ast?.type === 'Curator_Tool' ? req.ast.toolName : undefined);
            const action = typeof record?.type === 'string' ? record.type : tool ? 'TOOL_RESULT' : 'RESPONSE';
            return {
                id: String(r.id),
                entityType: req.agentId ? 'AGENT' : 'REQUEST',
                entityId: String(req.agentId ?? req.id ?? r.requestId),
                action,
                userId: req.userId ?? r.userId ?? null,
                agentId: req.agentId ?? null,
                requestId: req.id ?? r.requestId ?? null,
                status: req.status ?? 'UNKNOWN',
                metadata: { ...(record?.metadata || {}), ...(tool ? { tool } : {}), ...(record?.reason ? { reason: record.reason } : {}) },
                timestamp: new Date(r.createdAt).toISOString(),
            };
        });
    }
}
