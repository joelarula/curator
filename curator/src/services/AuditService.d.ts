import type { PrismaClient } from '@prisma/client';
export interface CreateAuditEntryInput {
    entityType: string;
    entityId: string;
    action: string;
    userId?: string | null;
    agentId?: string | null;
    requestId?: number | null;
    status?: string;
    metadata?: Record<string, any> | null;
}
export declare class AuditService {
    /**
     * Records an immutable audit log entry in the database.
     */
    static log(prisma: PrismaClient | any, entry: CreateAuditEntryInput): Promise<any>;
    /**
     * Retrieves audit logs filtered by agent or entity.
     */
    static getLogs(prisma: PrismaClient | any, options?: {
        agentId?: string;
        entityType?: string;
        entityId?: string;
        limit?: number;
    }): Promise<any>;
}
//# sourceMappingURL=AuditService.d.ts.map