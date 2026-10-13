import type { PrismaClient } from '@prisma/client';
export interface ToolSecurityConfig {
    name: string;
    requiredRole?: string;
    accessLevel?: string;
    requiresHumanApproval?: boolean;
}
export declare class AgentRoleService {
    /**
     * Validates whether an agent is permitted to execute a specific tool.
     * All tool access in Curator Core is whitelist-based by default.
     * If the agent has no roles, or none of its roles permit the tool, access is DENIED.
     */
    static validateAgentToolAccess(prisma: PrismaClient | any, agentId: string, toolName: string, toolConfig?: ToolSecurityConfig): Promise<{
        allowed: boolean;
        reason?: string;
        roleNames: string[];
    }>;
    /**
     * Seeds or ensures standard baseline roles exist in the database.
     */
    static ensureDefaultRoles(prisma: PrismaClient | any): Promise<void>;
}
//# sourceMappingURL=AgentRoleService.d.ts.map