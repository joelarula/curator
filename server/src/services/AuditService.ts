import { PrismaClient } from '@prisma/client';

export interface CreateAuditEntryInput {
    entityType: string; // 'AGENT' | 'REQUEST' | 'TOOL' | 'USER'
    entityId: string;
    action: string;     // 'AGENT_TRIGGERED' | 'TOOL_EXECUTION' | 'TOOL_BLOCKED' | 'HUMAN_APPROVAL_REQUIRED' | 'HUMAN_APPROVAL_GRANTED' | 'AGENT_WORKFLOW_COMPLETED' | 'AGENT_WORKFLOW_FAILED'
    userId?: string | null;
    agentId?: string | null;
    requestId?: number | null;
    status?: string;    // 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'PENDING_APPROVAL'
    metadata?: Record<string, any> | null;
}

export class AuditService {
    /**
     * Records an immutable audit log entry in the database.
     */
    static async log(prisma: PrismaClient, entry: CreateAuditEntryInput) {
        try {
            return await (prisma as any).auditLog.create({
                data: {
                    entityType: entry.entityType,
                    entityId: String(entry.entityId),
                    action: entry.action,
                    userId: entry.userId || null,
                    agentId: entry.agentId || null,
                    requestId: entry.requestId ? Number(entry.requestId) : null,
                    status: entry.status || 'SUCCESS',
                    metadata: entry.metadata || {},
                    timestamp: new Date()
                }
            });
        } catch (err) {
            console.error('[AuditService] Failed to create audit log entry:', err);
            return null;
        }
    }

    /**
     * Retrieves audit logs filtered by agent or entity.
     */
    static async getLogs(prisma: PrismaClient, options: { agentId?: string; entityType?: string; entityId?: string; limit?: number } = {}) {
        const where: any = {};
        if (options.agentId) {
            where.OR = [
                { agentId: options.agentId },
                { entityType: 'AGENT', entityId: options.agentId }
            ];
        } else if (options.entityType && options.entityId) {
            where.entityType = options.entityType;
            where.entityId = options.entityId;
        } else if (options.entityType) {
            where.entityType = options.entityType;
        }

        return await (prisma as any).auditLog.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: options.limit || 50
        });
    }
}
