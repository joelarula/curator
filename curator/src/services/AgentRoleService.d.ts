import type { PrismaClient } from '@prisma/client';
export interface ToolSecurityConfig {
    name: string;
    requiredRole?: string;
    accessLevel?: string;
    requiresHumanApproval?: boolean;
}
export interface ActorIdentity {
    agentId?: string | number | null;
    userId?: string | number | null;
    projectId?: string | number | null;
}
export declare class AgentRoleService {
    /**
     * Recursively traverses and resolves all assigned and inherited sub-roles from RoleInheritance.
     */
    static resolveInheritedRoleNames(prisma: PrismaClient | any, initialRoleKeys: string[]): Promise<string[]>;
    /**
     * Validates whether an actor (agent or human user) is permitted to execute a specific tool.
     * All tool access in Curator Core is whitelist-based by default.
     * Every action must be bound to an actor with whitelisted roles.
     * When actor.projectId is provided, roles are filtered so only global roles and roles
     * scoped to that specific project (e.g. '<domain>:<projectId>:<role>') are evaluated.
     */
    static validateActorToolAccess(prisma: PrismaClient | any, actor: ActorIdentity, toolName: string, toolConfig?: ToolSecurityConfig): Promise<{
        allowed: boolean;
        reason?: string;
        roleNames: string[];
    }>;
    /**
     * Validates whether an agent is permitted to execute a specific tool.
     * Delegates to validateActorToolAccess with agent identity.
     */
    static validateAgentToolAccess(prisma: PrismaClient | any, agentId: string, toolName: string, toolConfig?: ToolSecurityConfig): Promise<{
        allowed: boolean;
        reason?: string;
        roleNames: string[];
    }>;
    /**
     * Validates whether an agent is permitted to resolve a specific secret.
     * Denied by default if the agent has no roles.
     * Allowed if the agent has admin role, wildcard permission, or explicit secret permission (e.g. `secret:read:<name>` or `secret:<name>`).
     */
    static validateAgentSecretAccess(prisma: PrismaClient | any, agentId: string | number | null | undefined, secretName: string): Promise<{
        allowed: boolean;
        reason?: string;
        roleNames?: string[];
    }>;
    /**
     * Seeds or ensures standard baseline roles exist in the database.
     */
    static ensureDefaultRoles(prisma: PrismaClient | any): Promise<void>;
}
//# sourceMappingURL=AgentRoleService.d.ts.map