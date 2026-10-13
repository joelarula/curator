export class AuditService {
    /**
     * Records an immutable audit log entry in the database.
     */
    static async log(prisma, entry) {
        try {
            if (!prisma?.auditLog?.create) {
                return null;
            }
            return await prisma.auditLog.create({
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
        }
        catch (err) {
            console.error('[AuditService] Failed to create audit log entry:', err);
            return null;
        }
    }
    /**
     * Retrieves audit logs filtered by agent or entity.
     */
    static async getLogs(prisma, options = {}) {
        if (!prisma?.auditLog?.findMany)
            return [];
        const where = {};
        if (options.agentId) {
            where.OR = [
                { agentId: options.agentId },
                { entityType: 'AGENT', entityId: options.agentId }
            ];
        }
        else if (options.entityType && options.entityId) {
            where.entityType = options.entityType;
            where.entityId = options.entityId;
        }
        else if (options.entityType) {
            where.entityType = options.entityType;
        }
        return await prisma.auditLog.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: options.limit || 50
        });
    }
}
//# sourceMappingURL=AuditService.js.map