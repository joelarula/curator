import type { PrismaClient } from '@prisma/client';
import { isProjectWithin, getProjectAncestorIds } from './ProjectScopeService.js';

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

export class AgentRoleService {
    /**
     * The agent a request acts as (the same precedence the tool access check uses), or undefined for human calls.
     */
    static actorAgentId(req: { agentId?: unknown; context?: any } | null | undefined): string | undefined {
        const id = req?.agentId || req?.context?.agentId || req?.context?.activeAgentId || req?.context?.actorId;
        return id ? String(id) : undefined;
    }

    /**
     * Recursively traverses and resolves all assigned and inherited sub-roles from RoleInheritance.
     */
    static async resolveInheritedRoleNames(
        prisma: PrismaClient | any,
        initialRoleKeys: (string | number)[]
    ): Promise<string[]> {
        const resolvedNames = new Set<string>();
        const queue: (string | number)[] = [...initialRoleKeys];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const rawCurrent = queue.shift()!;
            if (rawCurrent == null) continue;
            const currentStr = String(rawCurrent);
            if (visited.has(currentStr)) continue;
            visited.add(currentStr);
            resolvedNames.add(currentStr);

            if (prisma?.roleInheritance?.findMany) {
                try {
                    let roleId = currentStr;
                    if (prisma?.role?.findFirst) {
                        const r = await prisma.role.findFirst({
                            where: { OR: [{ id: currentStr }, { name: currentStr }] },
                            select: { id: true, name: true }
                        });
                        if (r) {
                            resolvedNames.add(r.name);
                            roleId = r.id;
                        }
                    }

                    const inherited = await prisma.roleInheritance.findMany({
                        where: { parentId: roleId },
                        include: { subRole: true }
                    });

                    for (const inh of inherited) {
                        if (inh.subRole?.name) {
                            resolvedNames.add(inh.subRole.name);
                        }
                        if (inh.subRoleId && !visited.has(String(inh.subRoleId))) {
                            queue.push(inh.subRoleId);
                        }
                    }
                } catch {
                    // Ignore inheritance traversal errors if table is absent
                }
            }
        }

        return Array.from(resolvedNames);
    }

    /**
     * Validates whether an actor (agent or human user) is permitted to execute a specific tool.
     * All tool access in Curator Core is whitelist-based by default.
     * Every action must be bound to an actor with whitelisted roles.
     * When actor.projectId is provided, roles are filtered so only global roles and roles
     * scoped to that specific project (e.g. '<domain>:<projectId>:<role>') are evaluated.
     */
    static async validateActorToolAccess(
        prisma: PrismaClient | any,
        actor: ActorIdentity,
        toolName: string,
        toolConfig?: ToolSecurityConfig
    ): Promise<{ allowed: boolean; reason?: string; roleNames: string[] }> {
        if (!prisma) {
            // Allow-list only: without the role tables nothing can be allowed
            return { allowed: false, roleNames: [], reason: `Access Denied: no role database to check tool '${toolName}' against.` };
        }

        const agentId = actor?.agentId != null ? String(actor.agentId) : null;
        const userId = actor?.userId != null ? String(actor.userId) : null;
        const projectId = actor?.projectId != null ? String(actor.projectId) : null;

        if (!agentId && !userId) {
            return {
                allowed: false,
                roleNames: [],
                reason: `Access Denied: Unbound tool execution for '${toolName}'. Every action must be bound to an authenticated human or agent actor.`
            };
        }

        if (!agentId) {
            return AgentRoleService.evaluateSingleActor(prisma, { userId, projectId }, toolName, toolConfig);
        }

        // Narrowing: an agent acting for a user may only do what both are allowed (rights never grow down the chain)
        const agentResult = await AgentRoleService.evaluateSingleActor(prisma, { agentId, projectId }, toolName, toolConfig);
        if (!agentResult.allowed || !userId) return agentResult;
        const userResult = await AgentRoleService.evaluateSingleActor(prisma, { userId, projectId }, toolName, toolConfig);
        if (!userResult.allowed) {
            return {
                allowed: false,
                roleNames: agentResult.roleNames,
                reason: `Access Denied: the agent acts for a user who may not use tool '${toolName}'. ${userResult.reason ?? ''}`.trim(),
            };
        }
        return agentResult;
    }

    /** Role names that bypass tool and project checks. */
    static readonly SUPER_ADMIN_ROLES: readonly string[] = ['admin', 'agent:admin', 'system:admin', 'curator_admin', 'curator_manager'];

    /** The project and its ancestors, nearest first: roles given in a parent project count in its sub-projects. */
    private static async projectChain(prisma: PrismaClient | any, projectId: string | null): Promise<string[]> {
        if (!projectId) return [];
        return [projectId, ...(await getProjectAncestorIds(prisma, projectId))];
    }

    /** Checks one actor (an agent or a user, not both) against a tool. */
    private static async evaluateSingleActor(
        prisma: PrismaClient | any,
        actor: { agentId?: string | null; userId?: string | null; projectId: string | null },
        toolName: string,
        toolConfig?: ToolSecurityConfig
    ): Promise<{ allowed: boolean; reason?: string; roleNames: string[] }> {
        const effective = await AgentRoleService.resolveEffectiveRoles(prisma, actor);
        if (!effective.ok) return { allowed: false, reason: effective.reason, roleNames: effective.roleNames };
        const { roleNames, actorName } = effective;
        if (effective.superAdmin) return { allowed: true, roleNames };

        // 4. Tool's required role configuration match
        const requiredRole = toolConfig?.requiredRole;
        if (requiredRole && roleNames.includes(requiredRole)) {
            return { allowed: true, roleNames };
        }

        // 4b. Explicit ToolRole database relation match (many-to-many)
        if (prisma.toolRole?.findMany) {
            try {
                const dbToolRoles = await prisma.toolRole.findMany({
                    where: { tool: { name: toolName } },
                    include: { role: true },
                });
                for (const tr of dbToolRoles) {
                    const rName = tr.role?.name || tr.roleId;
                    if (rName && roleNames.includes(rName)) {
                        return { allowed: true, roleNames };
                    }
                }
            } catch {}
        }

        // 4c. Direct tool role match: e.g. "tool:poker_apply_action" or "poker_apply_action"
        if (roleNames.includes(`tool:${toolName}`) || roleNames.includes(toolName)) {
            return { allowed: true, roleNames };
        }

        // Access denied if not explicitly whitelisted
        const requiredText = requiredRole ? `'${requiredRole}' or 'tool:${toolName}'` : `'tool:${toolName}'`;
        return {
            allowed: false,
            roleNames,
            reason: `Access Denied: ${actorName} with roles [${roleNames.join(', ')}] is not whitelisted for tool '${toolName}'. Requires role ${requiredText}.`
        };
    }

    /**
     * Whether a user (or an agent) may address an agent: super-admins, holders of `agent:<name>` or `agent:*`, or of
     * the agent definition's `requiredRole`. Allow-list only: an agent that declares nothing is addressable only by
     * super-admins and `agent:<name>` holders. Project scoping and narrowing are the same as for tools.
     */
    static async validateAgentAddressAccess(
        prisma: PrismaClient | any,
        actor: ActorIdentity,
        agentName: string,
        policy: { requiredRole?: string } = {}
    ): Promise<{ allowed: boolean; reason?: string; roleNames: string[] }> {
        const accepted = [`agent:${agentName}`, 'agent:*', ...(policy.requiredRole ? [policy.requiredRole] : [])];
        const requiredText = policy.requiredRole ? `'${policy.requiredRole}' or 'agent:${agentName}'` : `'agent:${agentName}'`;
        return AgentRoleService.validateRoleGrant(prisma, actor, accepted, {
            subject: `address agent '${agentName}'`,
            requiredText,
        });
    }

    /**
     * Whether an actor may perform a named action (e.g. `db.export`): super-admins, or holders of one of `roles`.
     * Same project scoping and narrowing as tools and agents.
     */
    static async validateActionAccess(
        prisma: PrismaClient | any,
        actor: ActorIdentity,
        action: string,
        roles: string[]
    ): Promise<{ allowed: boolean; reason?: string; roleNames: string[] }> {
        return AgentRoleService.validateRoleGrant(prisma, actor, roles, {
            subject: `perform '${action}'`,
            requiredText: roles.map((r) => `'${r}'`).join(' or ') || 'a super-admin role',
        });
    }

    /**
     * Allowed when every actor in the chain (calling agent, user) is a super-admin or holds one of `accepted`
     * (narrowing). Denied without a database or an actor.
     */
    private static async validateRoleGrant(
        prisma: PrismaClient | any,
        actor: ActorIdentity,
        accepted: string[],
        text: { subject: string; requiredText: string }
    ): Promise<{ allowed: boolean; reason?: string; roleNames: string[] }> {
        if (!prisma) return { allowed: false, roleNames: [], reason: `Access Denied: no role database to check whether to ${text.subject}.` };
        const projectId = actor?.projectId != null ? String(actor.projectId) : null;
        const subjects: Array<{ agentId?: string; userId?: string; projectId: string | null }> = [];
        if (actor?.agentId != null) subjects.push({ agentId: String(actor.agentId), projectId });
        if (actor?.userId != null) subjects.push({ userId: String(actor.userId), projectId });
        if (subjects.length === 0) {
            return { allowed: false, roleNames: [], reason: `Access Denied: to ${text.subject} needs an authenticated user or agent.` };
        }
        let lastRoles: string[] = [];
        for (const subject of subjects) {
            const effective = await AgentRoleService.resolveEffectiveRoles(prisma, subject);
            if (!effective.ok) return { allowed: false, reason: effective.reason, roleNames: effective.roleNames };
            lastRoles = effective.roleNames;
            if (effective.superAdmin) continue;
            const names = effective.roleNames;
            if (!accepted.some((r) => names.includes(r))) {
                return {
                    allowed: false,
                    roleNames: names,
                    reason: `Access Denied: ${effective.actorName} with roles [${names.join(', ')}] may not ${text.subject}. Requires role ${text.requiredText}.`,
                };
            }
        }
        return { allowed: true, roleNames: lastRoles };
    }

    /**
     * The roles one actor (an agent or a user) holds in a project: assigned roles valid in the project chain, expanded
     * with RoleInheritance, then narrowed by every `ProjectRole` list in the chain. Denials (unknown, deleted,
     * disabled, wrong project, no roles) come back as `ok: false`.
     */
    static async resolveEffectiveRoles(
        prisma: PrismaClient | any,
        actor: { agentId?: string | null; userId?: string | null; projectId: string | null }
    ): Promise<
        | { ok: true; roleNames: string[]; actorName: string; superAdmin: boolean }
        | { ok: false; reason: string; roleNames: string[] }
    > {
        const agentId = actor.agentId ?? null;
        const userId = actor.userId ?? null;
        const targetProjectId = actor.projectId;
        const chain = await AgentRoleService.projectChain(prisma, targetProjectId);

        let actorName = '';
        const initialRoleKeys: string[] = [];

        // Project role lists (ProjectRole, project has 0 - n roles): each project in the chain that lists roles narrows
        // the valid roles, so a sub-project can only narrow what its parents allow
        const projectRoleLists: Array<{ projectId: string; roles: Set<string> }> = [];
        if (prisma.projectRole?.findMany) {
            for (const pid of chain) {
                try {
                    const pRoles = await prisma.projectRole.findMany({
                        where: { projectId: pid },
                        include: { role: true },
                    });
                    if (pRoles.length > 0) {
                        projectRoleLists.push({ projectId: pid, roles: new Set(pRoles.map((pr: any) => pr.role?.name).filter(Boolean)) });
                    }
                } catch {}
            }
        }

        if (agentId && prisma.agent?.findFirst) {
            const agent = await prisma.agent.findFirst({
                where: { OR: [{ id: agentId }, { name: agentId }] },
                include: {
                    roles: {
                        include: {
                            role: true,
                        },
                    },
                },
            });

            if (!agent || agent.existent === false || agent.deletedAt != null) {
                return {
                    ok: false,
                    roleNames: [],
                    reason: `Access Denied: Agent '${agent?.name || agentId}' not found or has been deleted.`
                };
            }

            if (agent.enabled === false) {
                return {
                    ok: false,
                    roleNames: [],
                    reason: `Access Denied: Agent '${agent.name || agentId}' is disabled.`
                };
            }

            // If agent belongs to a specific project, it may act there and in that project's sub-projects
            if (targetProjectId && agent.projectId && !(await isProjectWithin(prisma, targetProjectId, agent.projectId))) {
                return {
                    ok: false,
                    roleNames: [],
                    reason: `Access Denied: Agent '${agent.name || agentId}' is bound to project '${agent.projectId}' and cannot act in project '${targetProjectId}'.`
                };
            }

            actorName = `Agent '${agent.name || agentId}'`;
            for (const ar of (agent.roles || [])) {
                const rName = ar.role?.name;
                if (rName) {
                    initialRoleKeys.push(rName);
                    if (ar.roleId) initialRoleKeys.push(ar.roleId);
                } else if (ar.roleId) {
                    initialRoleKeys.push(ar.roleId);
                }
            }
        } else if (userId && prisma.user?.findFirst) {
            const user = await prisma.user.findFirst({
                where: { OR: [{ id: userId }, { email: userId }] },
                include: {
                    roles: {
                        include: {
                            role: true,
                        },
                    },
                },
            });

            if (!user) {
                return {
                    ok: false,
                    roleNames: [],
                    reason: `User '${userId}' not found.`
                };
            }

            actorName = `User '${user.name || user.email || userId}'`;
            for (const ur of (user.roles || [])) {
                // A role given in a project applies there and in its sub-projects (inherited downward), never in
                // other projects or globally
                if (ur.projectId && !chain.includes(String(ur.projectId))) {
                    continue;
                }

                const rName = ur.role?.name;
                if (rName) {
                    initialRoleKeys.push(rName);
                    if (ur.roleId) initialRoleKeys.push(ur.roleId);
                } else if (ur.roleId) {
                    initialRoleKeys.push(ur.roleId);
                }
            }
        }

        // Expand composable role hierarchy (RoleInheritance)
        let roleNames = await AgentRoleService.resolveInheritedRoleNames(prisma, initialRoleKeys);

        // 1. Strict Whitelist Rule: Actors with NO roles are denied all tool access by default
        if (roleNames.length === 0) {
            const scopeMsg = targetProjectId ? ` for project '${targetProjectId}'` : '';
            return {
                ok: false,
                roleNames: [],
                reason: `Access Denied: ${actorName} has no assigned roles${scopeMsg}. All access is whitelist-based by default.`
            };
        }

        // 2. Universal / admin wildcard roles (super-admins bypass project constraints)
        const isSuperAdmin = roleNames.some((r: string) => AgentRoleService.SUPER_ADMIN_ROLES.includes(r));
        if (isSuperAdmin) {
            return { ok: true, roleNames, actorName, superAdmin: true };
        }

        // 3. Project role lists (ProjectRole): every project in the chain that lists roles must list the role,
        // nearest project first, so a sub-project narrows and never widens.
        for (const list of projectRoleLists) {
            const projectScopedNames = roleNames.filter((r) => list.roles.has(r));
            if (projectScopedNames.length === 0) {
                return {
                    ok: false,
                    roleNames,
                    reason: `Access Denied: Roles held by ${actorName} [${roleNames.join(', ')}] are not assigned to project '${list.projectId}' (active project roles: [${Array.from(list.roles).join(', ')}]).`
                };
            }
            roleNames = projectScopedNames;
        }

        return { ok: true, roleNames, actorName, superAdmin: false };
    }

    /**
     * Validates whether an agent is permitted to execute a specific tool.
     * Delegates to validateActorToolAccess with agent identity.
     */
    static async validateAgentToolAccess(
        prisma: PrismaClient | any,
        agentId: string,
        toolName: string,
        toolConfig?: ToolSecurityConfig
    ): Promise<{ allowed: boolean; reason?: string; roleNames: string[] }> {
        return AgentRoleService.validateActorToolAccess(prisma, { agentId }, toolName, toolConfig);
    }

    /**
     * Validates whether an agent is permitted to resolve a specific secret.
     * Denied by default if the agent has no roles.
     * Allowed if the agent has an admin role or a secret role (e.g. `secret:read:<name>` or `secret:<name>`).
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
                include: { roles: { include: { role: true } } }
            });
        } catch (err: any) {
            // Fail closed: an error never grants a secret
            return { allowed: false, reason: `Access Denied: could not check secret access for agent '${agentId}': ${err?.message ?? err}` };
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

        return {
            allowed: false,
            roleNames,
            reason: `Access Denied: Agent '${agent.name}' with roles [${roleNames.join(', ')}] is not permitted to access secret '${secretName}'. Requires role 'secret:${secretName}' or 'secret:*'.`
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
            { name: 'agent:manager', description: 'Permits managing sub-agents, sub-projects and role grants inside the actor\'s workspace (never its own records)' },
            { name: 'agent:admin', description: 'Unrestricted access to all tools including destructive and elevated operations' },
            // Host actions (AccessService CURATOR_ACTION_ROLES)
            { name: 'curator:db:status', description: 'May view database health (row counts of requests, agents, users)' },
            { name: 'curator:db:export', description: 'May download the whole database file' },
            { name: 'curator:db:import', description: 'May replace the database file' },
            { name: 'curator:requests:read', description: "May read other users' requests and responses in the project" },
            { name: 'prompts:write', description: 'May save and delete prompts of the project prompt library' }
        ];

        for (const r of defaultRoles) {
            await (prisma as any).role.upsert({
                where: { id: r.name },
                update: { description: r.description },
                create: { id: r.name, name: r.name, description: r.description }
            });
        }
    }
}

