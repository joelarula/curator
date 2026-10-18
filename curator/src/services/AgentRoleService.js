export class AgentRoleService {
    /**
     * Recursively traverses and resolves all assigned and inherited sub-roles from RoleInheritance.
     */
    static async resolveInheritedRoleNames(prisma, initialRoleKeys) {
        const resolvedNames = new Set();
        const queue = [...initialRoleKeys];
        const visited = new Set();
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || visited.has(current))
                continue;
            visited.add(current);
            resolvedNames.add(current);
            if (prisma?.roleInheritance?.findMany) {
                try {
                    let roleId = current;
                    if (prisma?.role?.findFirst) {
                        const r = await prisma.role.findFirst({
                            where: { OR: [{ id: current }, { name: current }] },
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
                        if (inh.subRoleId && !visited.has(inh.subRoleId)) {
                            queue.push(inh.subRoleId);
                        }
                    }
                }
                catch {
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
    static async validateActorToolAccess(prisma, actor, toolName, toolConfig) {
        if (!prisma) {
            return { allowed: true, roleNames: [] };
        }
        const agentId = actor?.agentId != null ? String(actor.agentId) : null;
        const userId = actor?.userId != null ? String(actor.userId) : null;
        const targetProjectId = actor?.projectId != null ? String(actor.projectId) : null;
        if (!agentId && !userId) {
            return {
                allowed: false,
                roleNames: [],
                reason: `Access Denied: Unbound tool execution for '${toolName}'. Every action must be bound to an authenticated human or agent actor.`
            };
        }
        let actorName = '';
        const initialRoleKeys = [];
        const attachedPermissions = [];
        // Check project-assigned roles via ProjectRole database relation (project has 0 - n roles)
        let projectAssignedRoles = null;
        if (targetProjectId && prisma.projectRole?.findMany) {
            try {
                const pRoles = await prisma.projectRole.findMany({
                    where: { projectId: targetProjectId },
                    include: { role: true },
                });
                if (pRoles.length > 0) {
                    projectAssignedRoles = new Set(pRoles.map((pr) => pr.role?.name).filter(Boolean));
                }
            }
            catch { }
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
            if (!agent) {
                return {
                    allowed: false,
                    roleNames: [],
                    reason: `Agent '${agentId}' not found.`
                };
            }
            // If agent belongs to a specific project, verify project match
            if (targetProjectId && agent.projectId && agent.projectId !== targetProjectId) {
                return {
                    allowed: false,
                    roleNames: [],
                    reason: `Access Denied: Agent '${agent.name || agentId}' is bound to project '${agent.projectId}' and cannot act in project '${targetProjectId}'.`
                };
            }
            actorName = `Agent '${agent.name || agentId}'`;
            for (const ar of (agent.roles || [])) {
                const rName = ar.role?.name;
                if (rName) {
                    initialRoleKeys.push(rName);
                    if (ar.roleId)
                        initialRoleKeys.push(ar.roleId);
                }
                else if (ar.roleId) {
                    initialRoleKeys.push(ar.roleId);
                }
                if (ar.role?.permissions)
                    attachedPermissions.push(...ar.role.permissions);
            }
        }
        else if (userId && prisma.user?.findFirst) {
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
                    allowed: false,
                    roleNames: [],
                    reason: `User '${userId}' not found.`
                };
            }
            actorName = `User '${user.name || user.email || userId}'`;
            for (const ur of (user.roles || [])) {
                // Database model relation project scoping:
                // If userRole is scoped to a specific project, it only applies when targetProjectId matches
                if (targetProjectId && ur.projectId && ur.projectId !== targetProjectId) {
                    continue;
                }
                // If executing in a global context (no targetProjectId), project-specific roles do not apply globally
                if (!targetProjectId && ur.projectId) {
                    continue;
                }
                const rName = ur.role?.name;
                if (rName) {
                    initialRoleKeys.push(rName);
                    if (ur.roleId)
                        initialRoleKeys.push(ur.roleId);
                }
                else if (ur.roleId) {
                    initialRoleKeys.push(ur.roleId);
                }
                if (ur.role?.permissions)
                    attachedPermissions.push(...ur.role.permissions);
            }
        }
        // Expand composable role hierarchy (RoleInheritance)
        let roleNames = await AgentRoleService.resolveInheritedRoleNames(prisma, initialRoleKeys);
        // 1. Strict Whitelist Rule: Actors with NO roles are denied all tool access by default
        if (roleNames.length === 0) {
            const scopeMsg = targetProjectId ? ` for project '${targetProjectId}'` : '';
            return {
                allowed: false,
                roleNames: [],
                reason: `Access Denied: ${actorName} has no assigned roles${scopeMsg}. All tool access is whitelist-based by default.`
            };
        }
        // 2. Universal / admin wildcard roles (super-admins bypass project constraints)
        const isSuperAdmin = roleNames.some((r) => r === 'admin' || r === 'agent:admin' || r === 'system:admin' || r === 'curator_admin' || r === 'curator_manager');
        if (isSuperAdmin) {
            return { allowed: true, roleNames };
        }
        // 3. Project-Assigned Roles Filter (via ProjectRole model relation):
        // If the project explicitly defines 0-n roles in ProjectRole, the user's role must be
        // assigned to that project to be valid within this project context.
        if (projectAssignedRoles && projectAssignedRoles.size > 0) {
            const projectScopedNames = roleNames.filter((r) => projectAssignedRoles.has(r));
            if (projectScopedNames.length === 0) {
                return {
                    allowed: false,
                    roleNames,
                    reason: `Access Denied: Roles held by ${actorName} [${roleNames.join(', ')}] are not assigned to project '${targetProjectId}' (active project roles: [${Array.from(projectAssignedRoles).join(', ')}]).`
                };
            }
            roleNames = projectScopedNames;
        }
        // 4. Tool's required role configuration match
        const requiredRole = toolConfig?.requiredRole;
        if (requiredRole && roleNames.includes(requiredRole)) {
            return { allowed: true, roleNames };
        }
        // 4. Direct tool role match: e.g. "tool:poker_apply_action" or "poker_apply_action"
        if (roleNames.includes(`tool:${toolName}`) || roleNames.includes(toolName)) {
            return { allowed: true, roleNames };
        }
        // 5. Granular permissions attached to roles
        for (const rp of attachedPermissions) {
            const p = rp.permission;
            if (!p)
                continue;
            if (p.name === '*' || p.name === 'all_tools' || p.toolName === '*') {
                return { allowed: true, roleNames };
            }
            if (p.toolName === toolName || p.name === toolName || p.name === `tool:${toolName}`) {
                return { allowed: true, roleNames };
            }
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
     * Validates whether an agent is permitted to execute a specific tool.
     * Delegates to validateActorToolAccess with agent identity.
     */
    static async validateAgentToolAccess(prisma, agentId, toolName, toolConfig) {
        return AgentRoleService.validateActorToolAccess(prisma, { agentId }, toolName, toolConfig);
    }
    /**
     * Validates whether an agent is permitted to resolve a specific secret.
     * Denied by default if the agent has no roles.
     * Allowed if the agent has admin role, wildcard permission, or explicit secret permission (e.g. `secret:read:<name>` or `secret:<name>`).
     */
    static async validateAgentSecretAccess(prisma, agentId, secretName) {
        if (!agentId || !prisma?.agent?.findUnique) {
            // Direct user interaction or non-agent execution is permitted
            return { allowed: true };
        }
        const numericId = Number(agentId);
        const whereClause = !isNaN(numericId) && typeof agentId !== 'boolean' ? { id: numericId } : { id: String(agentId) };
        let agent = null;
        try {
            agent = await prisma.agent.findUnique({
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
        }
        catch (_) {
            return { allowed: true };
        }
        if (!agent) {
            return {
                allowed: false,
                reason: `Agent '${agentId}' not found.`
            };
        }
        const agentRoles = agent.roles || [];
        const roleNames = agentRoles.map((r) => r.role?.name || r.roleId);
        if (agentRoles.length === 0) {
            return {
                allowed: false,
                roleNames,
                reason: `Access Denied: Agent '${agent.name}' has no assigned roles. Secret resolution requires authorization.`
            };
        }
        // Admin wildcard
        const isSuperAdmin = roleNames.some((r) => r === 'admin' || r === 'agent:admin' || r === 'system:admin');
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
                if (!p)
                    continue;
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
    static async ensureDefaultRoles(prisma) {
        if (!prisma?.role?.upsert)
            return;
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
            await prisma.role.upsert({
                where: { name: r.name },
                update: { description: r.description },
                create: { name: r.name, description: r.description }
            });
        }
    }
}
//# sourceMappingURL=AgentRoleService.js.map