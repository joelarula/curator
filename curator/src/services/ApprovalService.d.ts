import type { PrismaClient } from '@prisma/client';
export type ApprovalScope = 'ONETIME' | 'CONVERSATION' | 'PERMANENT';
export interface CheckApprovalResult {
    approved: boolean;
    scope?: ApprovalScope;
    approvalId?: string;
    reason?: string;
}
export declare class ApprovalService {
    /**
     * Checks if a tool invocation has been approved at any of the 3 scopes:
     * 1. PERMANENT: Persisted on the agent (and not revoked)
     * 2. CONVERSATION: Persisted for this conversation session (and not revoked)
     * 3. ONETIME: Explicitly granted for this request execution context
     */
    static checkApproval(prisma: PrismaClient | any, params: {
        toolName: string;
        agentId?: string | null;
        conversationId?: number | string | null;
        context?: any;
    }): Promise<CheckApprovalResult>;
    /**
     * Grants a tool approval with an explicit scope (ONETIME, CONVERSATION, or PERMANENT).
     */
    static grantApproval(prisma: PrismaClient | any, opts: {
        toolName: string;
        scope: ApprovalScope;
        approvedBy: string;
        agentId?: string | null;
        conversationId?: number | string | null;
        requestId?: number | null;
        userId?: string | null;
    }): Promise<any>;
    /**
     * Revokes a previously granted approval by ID.
     */
    static revokeApproval(prisma: PrismaClient | any, approvalId: string, revokedBy: string): Promise<any>;
    /**
     * Revokes all active permanent approvals for an agent and tool.
     */
    static revokeAgentToolApproval(prisma: PrismaClient | any, agentId: string, toolName: string, revokedBy: string): Promise<number>;
    /**
     * Lists approvals with optional filtering.
     */
    static listApprovals(prisma: PrismaClient | any, filter?: {
        agentId?: string;
        toolName?: string;
        scope?: string;
        includeRevoked?: boolean;
    }): Promise<any[]>;
}
//# sourceMappingURL=ApprovalService.d.ts.map