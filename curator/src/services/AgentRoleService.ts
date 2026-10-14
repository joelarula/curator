import type { PrismaClient } from '@prisma/client';

export interface ToolSecurityConfig {
    name: string;
    requiredRole?: string;
    accessLevel?: string;
    requiresHumanApproval?: boolean;
}

export class AgentRoleService {
    /**
     * Validates whether an agent is permitted to execute a specific tool.
     * All tool access in Curator Core is whitelist-based by default.
     * If the agent has no roles, or none of its roles permit the tool, access is DENIED.
     */
    static async validateAgentToolAccess(
        prisma: PrismaClient | any,
        agentId: string,
        toolName: string,
        toolConfig?: ToolSecurityConfig
    ): Promise<{ allowed: boolean; reason?: string; roleNames: string[] }> {
        if (!prisma?.agent?.findUnique) {
            return { allowed: true, roleNames: [] };
        }

        const agent = await (prisma as any).agent.findUnique({
            where: { id: agentId },
            include: {
                roles: {
                    include: {
                        role: {
                            include: {
                                permissions: {
                                    include: {
                                        permission: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!agent) {
            return {
                allowed: false,
                roleNames: [],
                reason: `Agent '${agentId}' not found.`
            };
        }

        const agentRoles = agent.roles || [];
        const roleNames = agentRoles.map((r: any) => r.role?.name || r.roleId);

        // 1. Whitelist Rule: Agents with NO roles are denied all tool access by default
        if (agentRoles.length === 0) {
            return {
                allowed: false,
                roleNames: [],
                reason: `Access Denied: Agent '${agent.name}' has no assigned roles. All tool access is whitelist-based by default.`
            };
        }

        // 2. Check for universal / admin wildcard roles
        const isSuperAdmin = roleNames.some((r: string) => 
            r === 'admin' || r === 'agent:admin' || r === 'system:admin'
        );
        if (isSuperAdmin) {
            return { allowed: true, roleNames };
        }

        // 3. Check if any role matches the tool's required role configuration
        const requiredRole = toolConfig?.requiredRole;
        if (requiredRole && roleNames.includes(requiredRole)) {
            return { allowed: true, roleNames };
        }

        // 4. Check for direct tool role: e.g. "tool:upsert_resource" or "upsert_resource"
        if (roleNames.includes(`tool:${toolName}`) || roleNames.includes(toolName)) {
            return { allowed: true, roleNames };
        }

        // 5. Check granular permissions attached to the assigned roles
        for (const ar of agentRoles) {
            const perms = ar.role?.permissions || [];
            for (const rp of perms) {
                const p = rp.permission;
                if (!p) continue;

                // Wildcard permission
                if (p.name === '*' || p.name === 'all_tools' || p.toolName === '*') {
                    return { allowed: true, roleNames };
                }

                // Explicit tool permission
                if (p.toolName === toolName || p.name === toolName || p.name === `tool:${toolName}`) {
                    return { allowed: true, roleNames };
                }
            }
        }

        // Access denied if not explicitly whitelisted
        const requiredText = requiredRole ? `'${requiredRole}' or 'tool:${toolName}'` : `'tool:${toolName}'`;
        return {
            allowed: false,
            roleNames,
            reason: `Access Denied: Agent '${agent.name}' with roles [${roleNames.join(', ')}] is not whitelisted for tool '${toolName}'. Requires role ${requiredText}.`
        };
    }

    /**
     * Validates whether an agent is permitted to resolve a specific secret.
     * Denied by default if the agent has no roles.
     * Allowed if the agent has admin role, wildcard permission, or explicit secret permission (e.g. `secret:read:<name>` or `secret:<name>`).
     */
    static async validateAgentSecretAccess(
        prisma: PrismaClient | any,
        agentId: string | number | null | undefined,
        secretName: string
    ): Promise<{ allowed: boolean; reason?: string; roleNames?: string[] }> {
        if (!agentId || !prisma?.agent?.findUnique) {
            // Direct user interaction or non-agent execution is permitted
            return { allowed: true };
        }

        const numericId = Number(agentId);
        const whereClause = !isNaN(numericId) && typeof agentId !== 'boolean' ? { id: numericId } : { id: String(agentId) };

        let agent: any = null;
        try {
            agent = await (prisma as any).agent.findUnique({
                where: whereClause,
                include: {
                    roles: {
                        include: {
                            role: {
                                include: {
                                    permissions: {
                                        include: {
                                            permission: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
        } catch (_) {
            return { allowed: true };
        }

        if (!agent) {
            return {
                allowed: false,
                reason: `Agent '${agentId}' not found.`
            };
        }

        const agentRoles = agent.roles || [];
        const roleNames = agentRoles.map((r: any) => r.role?.name || r.roleId);

        if (agentRoles.length === 0) {
            return {
                allowed: false,
                roleNames,
                reason: `Access Denied: Agent '${agent.name}' has no assigned roles. Secret resolution requires authorization.`
            };
        }

        // Admin wildcard
        const isSuperAdmin = roleNames.some((r: string) => 
            r === 'admin' || r === 'agent:admin' || r === 'system:admin'
        );
        if (isSuperAdmin) {
            return { allowed: true, roleNames };
        }

        // Direct secret role
        if (roleNames.includes(`secret:${secretName}`) || roleNames.includes('secret:*') || roleNames.includes(`secret:read:${secretName}`)) {
            return { allowed: true, roleNames };
        }

        // Permissions attached to roles
        for (const ar of agentRoles) {
            const perms = ar.role?.permissions || [];
            for (const rp of perms) {
                const p = rp.permission;
                if (!p) continue;

                if (p.name === '*' || p.name === 'secret:*' || p.name === `secret:${secretName}` || p.name === `secret:read:${secretName}` || p.name === `secret:read:*`) {
                    return { allowed: true, roleNames };
                }
            }
        }

        return {
            allowed: false,
            roleNames,
            reason: `Access Denied: Agent '${agent.name}' with roles [${roleNames.join(', ')}] is not permitted to access secret '${secretName}'. Requires permission 'secret:${secretName}' or 'secret:*'.`
        };
    }

    /**
     * Seeds or ensures standard baseline roles exist in the database.
     */
    static async ensureDefaultRoles(prisma: PrismaClient | any): Promise<void> {
        if (!prisma?.role?.upsert) return;

        const defaultRoles = [
            { name: 'agent:reader', description: 'Permits read-only queries, embeddings, classification, and language models' },
            { name: 'agent:writer', description: 'Permits knowledge graph writes, text upserts, and RDF relations' },
            { name: 'agent:operator', description: 'Permits web scraping, feed processing, iteration, and flow execution' },
            { name: 'agent:developer', description: 'Permits sandboxed script execution' },
            { name: 'agent:browser', description: 'Permits browser automation and DOM interactions' },
            { name: 'agent:llm_user', description: 'Permits llama.cpp and local LLM endpoints' },
            { name: 'agent:admin', description: 'Unrestricted access to all tools including destructive and elevated operations' }
        ];

        for (const r of defaultRoles) {
            await (prisma as any).role.upsert({
                where: { name: r.name },
                update: { description: r.description },
                create: { name: r.name, description: r.description }
            });
        }
    }
}

