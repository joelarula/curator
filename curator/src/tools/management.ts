import { defineTool, type CuratorToolContext } from './CuratorTool.js';
import { isValidSchedule, cancelAgentLoops } from '../engine/AgentScheduleSupervisor.js';
import { saveScriptVersion, activateScriptVersion, getScriptVersionAst } from '../engine/ScriptRegistry.js';
import { ManagementGuardService as Guard, ManagementGuardError, actorFromToolContext, type ManagementActor } from '../services/ManagementGuardService.js';
import { getProjectSubtreeIds } from '../services/ProjectScopeService.js';

/**
 * Management tools: CRUD over Curator's own entities (agents + role grants, scripts, projects) so management
 * can be declared to an agent. Three layers apply to every call:
 *  1. RBAC (`requiredRole`, ToolRole, project roles) — `AgentRoleService`, before the tool runs.
 *  2. Reservations — `elevated` / `destructive` tools pause on WAITING_FOR_USER until approved (`ApprovalService`).
 *  3. Isolation — `ManagementGuardService` inside the tool: workspace-scoped writes, no self/ancestor mutation,
 *     sub-agents only, no privilege escalation, agent-authored script changes land as drafts.
 * Project ids come from the request (host session / `x-project-id`); tool args may only pick a sub-project.
 */

type Ctx = CuratorToolContext & Record<string, any>;

function requirePrisma(ctx: Ctx): any {
  if (!ctx.prisma) throw new Error('Database connection not available in tool context.');
  return ctx.prisma;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`'${key}' must be a non-empty string.`);
  return v.trim();
}

function optString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw new Error(`'${key}' must be a string.`);
  return v.trim();
}

function optStringArray(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x)) throw new Error(`'${key}' must be an array of strings.`);
  return [...new Set(v as string[])];
}

async function findAgentOrThrow(prisma: any, key: string) {
  const agent = await Guard.findAgent(prisma, key);
  if (!agent || agent.existent === false) throw new ManagementGuardError('NOT_FOUND', `Agent '${key}' not found.`);
  return agent;
}

async function findScriptOrThrow(prisma: any, actor: ManagementActor, args: Record<string, unknown>) {
  const name = optString(args, 'name');
  const id = args.id !== undefined ? Number(args.id) : undefined;
  if (!name && (id === undefined || Number.isNaN(id))) throw new Error(`Provide 'name' or 'id' of the script.`);
  const script = await prisma.script.findFirst({
    where: { AND: [id !== undefined ? { id } : { name }, { existent: true }, await Guard.readableWhere(prisma, actor)] },
  });
  if (!script) throw new ManagementGuardError('NOT_FOUND', `Script '${name ?? id}' not found in this workspace.`);
  return script;
}

async function resolveRoles(prisma: any, keys: string[]): Promise<{ id: string; name: string }[]> {
  const roles: { id: string; name: string }[] = [];
  for (const key of keys) {
    const role = await prisma.role.findFirst({ where: { OR: [{ id: key }, { name: key }] }, select: { id: true, name: true } });
    if (!role) throw new ManagementGuardError('NOT_FOUND', `Role '${key}' not found.`);
    roles.push(role);
  }
  return roles;
}

const agentView = (a: any) => ({
  id: a.id, name: a.name, projectId: a.projectId ?? null, parentAgentId: a.parentAgentId ?? null,
  scriptId: a.scriptId ?? null, schedule: a.schedule, enabled: a.enabled,
  roles: (a.roles ?? []).map((r: any) => r.role?.name ?? r.roleId),
});

// ─────────────────────────────────────────────────────────────────────────────
// Agents
// ─────────────────────────────────────────────────────────────────────────────

export const list_agents = defineTool({
  name: 'list_agents',
  description: 'Lists agents visible in the current workspace (and its sub-projects) with their roles, script, schedule and creator (parentAgentId).',
  accessLevel: 'safe_read',
  requiredRole: 'agent:reader',
  parameters: {
    type: 'object',
    properties: {
      includeDisabled: { type: 'boolean', description: 'Include disabled agents (default false).' },
      subAgentsOnly: { type: 'boolean', description: 'Only agents created by the calling agent (transitively).' },
    },
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const agents = await prisma.agent.findMany({
      where: { AND: [{ existent: true }, args.includeDisabled === true ? {} : { enabled: true }, await Guard.readableWhere(prisma, actor)] },
      include: { roles: { include: { role: true } } },
      orderBy: { name: 'asc' },
      take: 500,
    });
    const self = actor.agentId ? await Guard.findAgent(prisma, actor.agentId) : null;
    const out = [];
    for (const a of agents) {
      const isSubAgent = self ? (await Guard.agentAncestorIds(prisma, a.id)).includes(self.id) : false;
      if (args.subAgentsOnly === true && !isSubAgent) continue;
      out.push({ ...agentView(a), self: self?.id === a.id, manageable: self ? isSubAgent : undefined });
    }
    return { agents: out };
  },
});

export const upsert_agent = defineTool({
  name: 'upsert_agent',
  description: 'Creates a sub-agent (owned by the calling agent) or updates an agent you manage: script, schedule, enabled flag, and initial roles (only roles you hold). An agent can never change itself or its creator.',
  accessLevel: 'elevated',
  requiredRole: 'agent:manager',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Unique agent name (used to find an existing agent).' },
      id: { type: 'string', description: 'Id of an existing agent to update (optional).' },
      scriptName: { type: 'string', description: 'Workflow script the agent runs (must be visible in this workspace).' },
      schedule: { type: 'string', description: 'Cron or interval, e.g. "every 1 hour".' },
      enabled: { type: 'boolean', description: 'Enable or disable the agent.' },
      projectId: { type: 'string', description: 'Sub-project of the current workspace to place a new agent in (default: the workspace).' },
      roles: { type: 'array', items: { type: 'string' }, description: 'Roles to grant (ids or names); you may grant only roles you hold.' },
    },
    required: ['name'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const name = requireString(args, 'name');
    const id = optString(args, 'id');
    const schedule = optString(args, 'schedule');
    const scriptName = optString(args, 'scriptName');
    const roleKeys = optStringArray(args, 'roles');
    if (schedule && !isValidSchedule(schedule)) throw new Error(`schedule '${schedule}' is not a valid cron or interval expression.`);
    if (args.enabled !== undefined && typeof args.enabled !== 'boolean') throw new Error(`'enabled' must be a boolean.`);

    let scriptId: number | undefined;
    if (scriptName) {
      const script = await findScriptOrThrow(prisma, actor, { name: scriptName });
      scriptId = script.id;
    }
    // Checked before any write: an agent can grant only roles it holds.
    const roles = await resolveRoles(prisma, roleKeys);
    await Guard.assertHoldsRoles(prisma, actor, roles.map((r) => r.name));

    // Names are globally unique: an existing agent with this name must be manageable, never silently taken over.
    const existing = id ? await findAgentOrThrow(prisma, id) : await Guard.findAgent(prisma, name);
    let agent: any;
    if (existing) {
      await Guard.assertCanManageAgent(prisma, actor, existing);
      if (name !== existing.name && (await Guard.findAgent(prisma, name))) throw new Error(`Agent name '${name}' is taken.`);
      agent = await prisma.agent.update({
        where: { id: existing.id },
        data: {
          name,
          ...(scriptId !== undefined && { scriptId }),
          ...(schedule !== undefined && { schedule }),
          ...(args.enabled !== undefined && { enabled: args.enabled as boolean }),
          existent: true,
          deletedAt: null,
        },
      });
    } else {
      const projectId = optString(args, 'projectId') ?? actor.projectId ?? null;
      await Guard.assertWritableProject(prisma, actor, projectId);
      const self = actor.agentId ? await Guard.findAgent(prisma, actor.agentId) : null;
      const userId = actor.userId ?? self?.userId;
      if (!userId) throw new Error('A user is required to own the agent.');
      agent = await prisma.agent.create({
        data: {
          name,
          userId,
          projectId,
          parentAgentId: self?.id ?? null,
          ...(scriptId !== undefined && { scriptId }),
          ...(schedule !== undefined && { schedule }),
          enabled: (args.enabled as boolean | undefined) ?? true,
        },
      });
    }

    if (roles.length > 0) {
      await Guard.assertCanGrantRoles(prisma, actor, agent, roles.map((r) => r.name));
      for (const r of roles) {
        await prisma.agentRole.upsert({
          where: { agentId_roleId: { agentId: agent.id, roleId: r.id } },
          update: {},
          create: { agentId: agent.id, roleId: r.id },
        });
      }
    }
    const full = await prisma.agent.findUnique({ where: { id: agent.id }, include: { roles: { include: { role: true } } } });
    return { ok: true, created: !existing, agent: agentView(full) };
  },
});

export const delete_agent = defineTool({
  name: 'delete_agent',
  description: 'Soft-deletes (disables) a sub-agent you manage and cancels its scheduled runs. With cascade=true its own sub-agents are deleted too.',
  accessLevel: 'destructive',
  requiredRole: 'agent:manager',
  requiresHumanApproval: true,
  parameters: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'Agent id or name.' },
      cascade: { type: 'boolean', description: 'Also delete the agent\'s sub-agents (default false: refuse if it has any).' },
    },
    required: ['agent'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const target = await findAgentOrThrow(prisma, requireString(args, 'agent'));
    await Guard.assertCanManageAgent(prisma, actor, target);

    // Collect the target's live sub-agent tree.
    const tree: string[] = [target.id];
    for (let i = 0; i < tree.length && tree.length < 1000; i++) {
      const kids = await prisma.agent.findMany({ where: { parentAgentId: tree[i], existent: true }, select: { id: true } });
      tree.push(...kids.map((k: { id: string }) => k.id).filter((k: string) => !tree.includes(k)));
    }
    if (tree.length > 1 && args.cascade !== true) {
      throw new Error(`Agent '${target.name}' has ${tree.length - 1} sub-agent(s); pass cascade=true to delete them too.`);
    }
    let cancelled = 0;
    for (const agentId of tree) {
      await prisma.agent.update({ where: { id: agentId }, data: { enabled: false, existent: false, deletedAt: new Date() } });
      cancelled += await cancelAgentLoops(prisma, agentId);
    }
    return { ok: true, deleted: tree, cancelledRequests: cancelled };
  },
});

export const grant_agent_role = defineTool({
  name: 'grant_agent_role',
  description: 'Grants roles to a sub-agent you manage. You can grant only roles you hold yourself and never to yourself.',
  accessLevel: 'elevated',
  requiredRole: 'agent:manager',
  parameters: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'Agent id or name.' },
      roles: { type: 'array', items: { type: 'string' }, description: 'Role ids or names.' },
    },
    required: ['agent', 'roles'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const target = await findAgentOrThrow(prisma, requireString(args, 'agent'));
    const roles = await resolveRoles(prisma, optStringArray(args, 'roles'));
    if (roles.length === 0) throw new Error(`'roles' must not be empty.`);
    await Guard.assertCanGrantRoles(prisma, actor, target, roles.map((r) => r.name));
    for (const r of roles) {
      await prisma.agentRole.upsert({
        where: { agentId_roleId: { agentId: target.id, roleId: r.id } },
        update: {},
        create: { agentId: target.id, roleId: r.id },
      });
    }
    return { ok: true, agent: target.name, granted: roles.map((r) => r.name) };
  },
});

export const revoke_agent_role = defineTool({
  name: 'revoke_agent_role',
  description: 'Revokes roles from a sub-agent you manage.',
  accessLevel: 'safe_write',
  requiredRole: 'agent:manager',
  parameters: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'Agent id or name.' },
      roles: { type: 'array', items: { type: 'string' }, description: 'Role ids or names.' },
    },
    required: ['agent', 'roles'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const target = await findAgentOrThrow(prisma, requireString(args, 'agent'));
    await Guard.assertCanManageAgent(prisma, actor, target);
    const roles = await resolveRoles(prisma, optStringArray(args, 'roles'));
    const res = await prisma.agentRole.deleteMany({ where: { agentId: target.id, roleId: { in: roles.map((r) => r.id) } } });
    return { ok: true, agent: target.name, revoked: res?.count ?? 0 };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Scripts
// ─────────────────────────────────────────────────────────────────────────────

export const list_scripts = defineTool({
  name: 'list_scripts',
  description: 'Lists workflow scripts visible in the current workspace with their active version. "protected" marks scripts the caller cannot change (its own definition and what it calls).',
  accessLevel: 'safe_read',
  requiredRole: 'agent:reader',
  parameters: {
    type: 'object',
    properties: { nameContains: { type: 'string', description: 'Filter by name substring.' } },
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const nameContains = optString(args, 'nameContains');
    const scripts = await prisma.script.findMany({
      where: { AND: [{ existent: true }, nameContains ? { name: { contains: nameContains } } : {}, await Guard.readableWhere(prisma, actor)] },
      select: { id: true, name: true, projectId: true, currentVersion: true },
      orderBy: { name: 'asc' },
      take: 500,
    });
    const protectedIds = await Guard.protectedScriptIds(prisma, actor);
    return { scripts: scripts.map((s: any) => ({ ...s, protected: protectedIds.has(s.id) })) };
  },
});

export const get_script = defineTool({
  name: 'get_script',
  description: 'Returns the AST of a script version (default: the active version) and its version list.',
  accessLevel: 'safe_read',
  requiredRole: 'agent:reader',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Script name.' },
      id: { type: 'number', description: 'Script id (alternative to name).' },
      version: { type: 'number', description: 'Version to load (default: active).' },
    },
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const script = await findScriptOrThrow(prisma, actor, args);
    const versions = await prisma.scriptVersion.findMany({
      where: { scriptId: script.id }, select: { version: true, hash: true, createdBy: true, createdAt: true }, orderBy: { version: 'asc' },
    });
    const version = args.version !== undefined ? Number(args.version) : undefined;
    const loaded = versions.length > 0 ? await getScriptVersionAst(prisma, script.id, version) : null;
    return { id: script.id, name: script.name, projectId: script.projectId, currentVersion: script.currentVersion, version: loaded?.version ?? null, ast: loaded?.ast ?? null, versions };
  },
});

export const upsert_script = defineTool({
  name: 'upsert_script',
  description: 'Saves a compiled workflow AST as a new immutable script version. A new script becomes active immediately; a change to an existing script is stored as a DRAFT version that must be activated with promote_script_version (requires approval). You can never change your own script or the scripts it calls.',
  accessLevel: 'safe_write',
  requiredRole: 'agent:developer',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Script name (unique).' },
      ast: { type: 'object', description: 'Compiled Curator AST (Curator_Module or node).' },
      body: { type: 'string', description: 'Optional source text kept alongside the AST.' },
      projectId: { type: 'string', description: 'Sub-project of the workspace for a new script (default: the workspace).' },
    },
    required: ['name', 'ast'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const name = requireString(args, 'name');
    if (!args.ast || typeof args.ast !== 'object' || Array.isArray(args.ast)) throw new Error(`'ast' must be a compiled AST object.`);
    const body = optString(args, 'body') ?? null;

    const existing = await prisma.script.findUnique({ where: { name } });
    let projectId: string | null;
    if (existing) {
      await Guard.assertCanManageScript(prisma, actor, existing);
      projectId = existing.projectId ?? null;
    } else {
      projectId = optString(args, 'projectId') ?? actor.projectId ?? null;
      await Guard.assertWritableProject(prisma, actor, projectId);
    }
    const res = await saveScriptVersion(prisma, {
      name,
      ast: args.ast as any,
      body,
      userId: actor.userId,
      projectId,
      createdBy: actor.agentId ? `agent:${actor.agentId}` : actor.userId,
      onDrift: 'draft',
    });
    const active = !res.drift;
    return {
      ok: true, scriptId: res.scriptId, version: res.version, created: res.created, active,
      note: active ? undefined : `Stored as draft v${res.version}; call promote_script_version to activate it.`,
    };
  },
});

export const promote_script_version = defineTool({
  name: 'promote_script_version',
  description: 'Activates a stored (draft) script version. Requires human approval; an agent can never promote versions of its own script or the scripts it calls.',
  accessLevel: 'elevated',
  requiredRole: 'agent:developer',
  requiresHumanApproval: true,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Script name.' },
      id: { type: 'number', description: 'Script id (alternative to name).' },
      version: { type: 'number', description: 'Version to activate.' },
    },
    required: ['version'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const script = await findScriptOrThrow(prisma, actor, args);
    await Guard.assertCanManageScript(prisma, actor, script);
    const version = Number(args.version);
    if (!Number.isInteger(version) || version < 1) throw new Error(`'version' must be a positive integer.`);
    const res = await activateScriptVersion(prisma, script.id, version);
    return { ok: true, script: script.name, ...res };
  },
});

export const delete_script = defineTool({
  name: 'delete_script',
  description: 'Soft-deletes a script you manage and deactivates its event subscriptions. Refuses while an enabled agent runs it.',
  accessLevel: 'destructive',
  requiredRole: 'agent:developer',
  requiresHumanApproval: true,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Script name.' },
      id: { type: 'number', description: 'Script id (alternative to name).' },
    },
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const script = await findScriptOrThrow(prisma, actor, args);
    await Guard.assertCanManageScript(prisma, actor, script);
    const users = await prisma.agent.findMany({ where: { scriptId: script.id, existent: true, enabled: true }, select: { name: true } });
    if (users.length > 0) throw new Error(`Script '${script.name}' is run by agent(s) [${users.map((u: any) => u.name).join(', ')}]; disable or re-point them first.`);
    await prisma.script.update({ where: { id: script.id }, data: { existent: false, deletedAt: new Date() } });
    if (prisma.eventSubscription) {
      await prisma.eventSubscription.updateMany({ where: { scriptId: script.id, isActive: true }, data: { isActive: false } });
    }
    return { ok: true, deleted: script.name };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Projects (workspace hierarchy)
// ─────────────────────────────────────────────────────────────────────────────

export const list_projects = defineTool({
  name: 'list_projects',
  description: 'Lists the current workspace project and its sub-projects.',
  accessLevel: 'safe_read',
  requiredRole: 'agent:reader',
  parameters: { type: 'object', properties: {} },
  execute: async (_args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const ids = actor.projectId ? await getProjectSubtreeIds(prisma, actor.projectId) : null;
    if (!ids && actor.agentId) return { projects: [] };
    const projects = await prisma.project.findMany({
      where: { existent: true, ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, name: true, slug: true, parentId: true },
      orderBy: { name: 'asc' },
      take: 500,
    });
    return { workspace: actor.projectId ?? null, projects };
  },
});

export const upsert_project = defineTool({
  name: 'upsert_project',
  description: 'Creates a sub-project (workspace) under the current workspace or one of its sub-projects, or renames a sub-project you manage. Agents can never modify their own workspace or anything above it.',
  accessLevel: 'safe_write',
  requiredRole: 'agent:manager',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Id of an existing sub-project to rename (omit to create).' },
      name: { type: 'string', description: 'Project name.' },
      parentId: { type: 'string', description: 'Parent for a new sub-project (default: the workspace).' },
    },
    required: ['name'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const name = requireString(args, 'name');
    const id = optString(args, 'id');
    if (id) {
      const existing = await prisma.project.findUnique({ where: { id } });
      if (!existing || existing.existent === false) throw new ManagementGuardError('NOT_FOUND', `Project '${id}' not found.`);
      await Guard.assertCanManageProject(prisma, actor, id);
      const project = await prisma.project.update({ where: { id }, data: { name }, select: { id: true, name: true, parentId: true } });
      return { ok: true, created: false, project };
    }
    const parentId = optString(args, 'parentId') ?? actor.projectId ?? null;
    if (actor.agentId && !parentId) throw new ManagementGuardError('OUT_OF_WORKSPACE', 'Agents can create projects only inside their workspace.');
    if (parentId) await Guard.assertWritableProject(prisma, actor, parentId);
    const self = actor.agentId ? await Guard.findAgent(prisma, actor.agentId) : null;
    const userId = actor.userId ?? self?.userId;
    if (!userId) throw new Error('A user is required to own the project.');
    const project = await prisma.project.create({ data: { name, userId, parentId }, select: { id: true, name: true, parentId: true } });
    return { ok: true, created: true, project };
  },
});

export const delete_project = defineTool({
  name: 'delete_project',
  description: 'Soft-deletes a sub-project you manage together with its own sub-projects, and disables the agents defined in them.',
  accessLevel: 'destructive',
  requiredRole: 'agent:manager',
  requiresHumanApproval: true,
  parameters: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Project id.' } },
    required: ['id'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const id = requireString(args, 'id');
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing || existing.existent === false) throw new ManagementGuardError('NOT_FOUND', `Project '${id}' not found.`);
    await Guard.assertCanManageProject(prisma, actor, id);
    const subtree = await getProjectSubtreeIds(prisma, id);
    const now = new Date();
    await prisma.project.updateMany({ where: { id: { in: subtree } }, data: { existent: false, deletedAt: now } });
    const agents = await prisma.agent.findMany({ where: { projectId: { in: subtree }, existent: true }, select: { id: true } });
    for (const a of agents) {
      await cancelAgentLoops(prisma, a.id);
    }
    await prisma.agent.updateMany({
      where: { projectId: { in: subtree } },
      data: { enabled: false, existent: false, deletedAt: now },
    });
    await prisma.resource.updateMany({
      where: { projectId: { in: subtree } },
      data: { existent: false, deletedAt: now },
    });
    await prisma.relation.updateMany({
      where: { projectId: { in: subtree } },
      data: { existent: false },
    });
    return { ok: true, deletedProjects: subtree, disabledAgents: agents.length };
  },
});

export const managementTools = {
  list_agents,
  upsert_agent,
  delete_agent,
  grant_agent_role,
  revoke_agent_role,
  list_scripts,
  get_script,
  upsert_script,
  promote_script_version,
  delete_script,
  list_projects,
  upsert_project,
  delete_project,
};
