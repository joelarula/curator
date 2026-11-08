import type { PrismaClient } from '@prisma/client';
import { AgentRoleService } from './AgentRoleService.js';
import { SYSTEM_PROJECT_ID, getProjectAncestorIds, getProjectSubtreeIds, isProjectWithin } from './ProjectScopeService.js';

/**
 * ManagementGuardService — isolation rules for tools that manage Curator's own entities
 * (agents, role grants, scripts, projects). It runs inside the tools, after RBAC/approval
 * (`AgentRoleService` / `ApprovalService`) already allowed the call, so it also binds super-admin agents.
 *
 * Model:
 *  - Workspace: the request's project (`x-project-id` / host session, never tool args). Writes stay inside the
 *    workspace and its sub-projects (`Project.parentId`). The `system` project is readable, not writable
 *    (unless the workspace is `system` itself).
 *  - Governance tier: an agent's own Agent row, its role grants, its ancestors (`Agent.parentAgentId`), the
 *    script it runs and the scripts that script calls are never writable by that agent, even with approval.
 *  - Sub-agents: an agent may manage only agents it created (transitively) and may grant them only roles it
 *    holds itself (no privilege escalation).
 *  - Sub-projects: an agent may manage only strict sub-projects of its workspace, never the workspace itself
 *    or anything above it.
 *  Human callers (no agent) are bound by the workspace rule only; RBAC decides the rest.
 */

export interface ManagementActor {
  agentId?: string | null;
  userId?: string | null;
  /** Workspace project of the request. */
  projectId?: string | null;
  /** Script of the running request (its definition must not change under it). */
  scriptId?: number | null;
}

export type ManagementGuardCode =
  | 'FORBIDDEN_SELF_MUTATION'
  | 'FORBIDDEN_ANCESTOR_MUTATION'
  | 'NOT_A_SUB_AGENT'
  | 'PROTECTED_SCRIPT'
  | 'OUT_OF_WORKSPACE'
  | 'PRIVILEGE_ESCALATION'
  | 'NOT_FOUND';

export class ManagementGuardError extends Error {
  constructor(public readonly code: ManagementGuardCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'ManagementGuardError';
  }
}

const MAX_AGENT_DEPTH = 32;
const MAX_CALL_DEPTH = 4;
const MAX_PROTECTED_SCRIPTS = 64;

const str = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v));

/** Builds the actor from a tool context (`toolNode` / agent loop pass agentId, scriptId, projectId, userId). */
export function actorFromToolContext(ctx: Record<string, any>): ManagementActor {
  const scriptId = ctx.scriptId ?? ctx.context?.scriptId;
  return {
    agentId: str(ctx.agentId) ?? AgentRoleService.actorAgentId({ context: ctx.context }) ?? null,
    userId: str(ctx.userId),
    projectId: str(ctx.projectId),
    scriptId: scriptId != null && !Number.isNaN(Number(scriptId)) ? Number(scriptId) : null,
  };
}

/** Collects `ref` targets of `Curator_Call` nodes (cross-script refs only; '#local' refs stay in the same script). */
function collectCallRefs(node: unknown, out: Set<string>, seen = new Set<unknown>()): void {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const n of node) collectCallRefs(n, out, seen);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.type === 'Curator_Call' && typeof obj.ref === 'string') {
    const script = obj.ref.split('#')[0];
    if (script) out.add(script);
  }
  for (const v of Object.values(obj)) collectCallRefs(v, out, seen);
}

export class ManagementGuardService {
  static async findAgent(prisma: PrismaClient | any, key: string, includeDeleted = false): Promise<any | null> {
    return prisma.agent.findFirst({
      where: {
        AND: [
          { OR: [{ id: key }, { name: key }] },
          includeDeleted ? {} : { existent: true, deletedAt: null },
        ],
      },
    });
  }

  /** Ancestor agent ids (creator chain), nearest first. Stops if any ancestor has been deleted. */
  static async agentAncestorIds(prisma: PrismaClient | any, agentId: string): Promise<string[]> {
    const out: string[] = [];
    let current: string | null = agentId;
    try {
      for (let i = 0; i < MAX_AGENT_DEPTH && current; i++) {
        const row: { parentAgentId?: string | null; existent?: boolean | null; deletedAt?: Date | null } | null = await prisma.agent.findUnique({
          where: { id: current },
          select: { parentAgentId: true, existent: true, deletedAt: true },
        });
        if (!row || row.existent === false || row.deletedAt != null) break;
        const parent: string | null = row?.parentAgentId ?? null;
        if (!parent || parent === agentId || out.includes(parent)) break;
        out.push(parent);
        current = parent;
      }
    } catch {
      // Schema without Agent.parentAgentId: no lineage.
    }
    return out;
  }

  /** Resolves the acting agent row (by id or name); the actor's agentId may be either. */
  private static async actorAgent(prisma: PrismaClient | any, actor: ManagementActor): Promise<any | null> {
    if (!actor.agentId) return null;
    const agent = await ManagementGuardService.findAgent(prisma, actor.agentId);
    if (!agent) throw new ManagementGuardError('NOT_FOUND', `Acting agent '${actor.agentId}' not found.`);
    return agent;
  }

  /**
   * Scripts the actor must never change: the running script, the acting agent's and its ancestors' scripts,
   * and every script those call (bounded walk over `Curator_Call` refs of the active versions).
   */
  static async protectedScriptIds(prisma: PrismaClient | any, actor: ManagementActor): Promise<Set<number>> {
    const roots = new Set<number>();
    if (actor.scriptId) roots.add(actor.scriptId);
    const self = await ManagementGuardService.actorAgent(prisma, actor);
    if (self) {
      if (self.scriptId) roots.add(self.scriptId);
      for (const ancestorId of await ManagementGuardService.agentAncestorIds(prisma, self.id)) {
        const a = await prisma.agent.findUnique({ where: { id: ancestorId }, select: { scriptId: true } });
        if (a?.scriptId) roots.add(a.scriptId);
      }
    }

    const result = new Set<number>(roots);
    let frontier = [...roots];
    for (let depth = 0; depth < MAX_CALL_DEPTH && frontier.length > 0 && result.size < MAX_PROTECTED_SCRIPTS; depth++) {
      const scripts = await prisma.script.findMany({ where: { id: { in: frontier } }, select: { id: true, ast: true } });
      const refs = new Set<string>();
      for (const s of scripts) {
        const ast = typeof s.ast === 'string' ? (() => { try { return JSON.parse(s.ast); } catch { return null; } })() : s.ast;
        collectCallRefs(ast, refs);
      }
      if (refs.size === 0) break;
      const called = await prisma.script.findMany({ where: { name: { in: [...refs] } }, select: { id: true } });
      frontier = called.map((c: { id: number }) => c.id).filter((id: number) => !result.has(id));
      for (const id of frontier) result.add(id);
    }
    return result;
  }

  /** Project ids the actor may read: its workspace subtree, `system`, and (via `projectId: null`) global rows. */
  static async readableProjectIds(prisma: PrismaClient | any, actor: ManagementActor): Promise<string[] | null> {
    if (!actor.projectId) return actor.agentId ? [SYSTEM_PROJECT_ID] : null; // null = unrestricted (human, global context)
    const ids = await getProjectSubtreeIds(prisma, actor.projectId);
    if (!ids.includes(SYSTEM_PROJECT_ID)) ids.push(SYSTEM_PROJECT_ID);
    return ids;
  }

  /** Prisma `where` fragment limiting rows to what the actor may read. */
  static async readableWhere(prisma: PrismaClient | any, actor: ManagementActor): Promise<Record<string, any>> {
    const ids = await ManagementGuardService.readableProjectIds(prisma, actor);
    return ids ? { OR: [{ projectId: { in: ids } }, { projectId: null }] } : {};
  }

  /** Throws unless the actor may write a record owned by `targetProjectId`. */
  static async assertWritableProject(prisma: PrismaClient | any, actor: ManagementActor, targetProjectId: string | null | undefined): Promise<void> {
    const target = str(targetProjectId);
    if (!actor.projectId) {
      // Global context: humans are gated by RBAC only; agents may touch only global (project-less) rows.
      if (actor.agentId && target) {
        throw new ManagementGuardError('OUT_OF_WORKSPACE', `Agent '${actor.agentId}' has no workspace project and cannot write records of project '${target}'.`);
      }
      return;
    }
    if (!target) {
      if (actor.agentId) {
        throw new ManagementGuardError('OUT_OF_WORKSPACE', `Global (project-less) records are outside workspace '${actor.projectId}'.`);
      }
      return;
    }
    if (target === SYSTEM_PROJECT_ID && actor.projectId !== SYSTEM_PROJECT_ID) {
      throw new ManagementGuardError('OUT_OF_WORKSPACE', `The '${SYSTEM_PROJECT_ID}' project is read-only from workspace '${actor.projectId}'.`);
    }
    if (!(await isProjectWithin(prisma, target, actor.projectId))) {
      throw new ManagementGuardError('OUT_OF_WORKSPACE', `Project '${target}' is outside workspace '${actor.projectId}' and its sub-projects.`);
    }
  }

  /** Throws unless the actor may change/delete the agent row `target` (and its role grants). */
  static async assertCanManageAgent(prisma: PrismaClient | any, actor: ManagementActor, target: { id: string; name?: string; projectId?: string | null }): Promise<void> {
    const self = await ManagementGuardService.actorAgent(prisma, actor);
    if (self) {
      if (target.id === self.id) {
        throw new ManagementGuardError('FORBIDDEN_SELF_MUTATION', `Agent '${self.name}' cannot modify, re-role or delete itself.`);
      }
      const selfAncestors = await ManagementGuardService.agentAncestorIds(prisma, self.id);
      if (selfAncestors.includes(target.id)) {
        throw new ManagementGuardError('FORBIDDEN_ANCESTOR_MUTATION', `Agent '${self.name}' cannot modify its creator agent '${target.name ?? target.id}'.`);
      }
      const targetAncestors = await ManagementGuardService.agentAncestorIds(prisma, target.id);
      if (!targetAncestors.includes(self.id)) {
        throw new ManagementGuardError('NOT_A_SUB_AGENT', `Agent '${target.name ?? target.id}' was not created by agent '${self.name}' (or its sub-agents).`);
      }
    }
    await ManagementGuardService.assertWritableProject(prisma, actor, target.projectId);
  }

  /** Throws unless the actor may change/promote/delete the script `script`. */
  static async assertCanManageScript(prisma: PrismaClient | any, actor: ManagementActor, script: { id: number; name?: string; projectId?: string | null }): Promise<void> {
    const protectedIds = await ManagementGuardService.protectedScriptIds(prisma, actor);
    if (protectedIds.has(script.id)) {
      throw new ManagementGuardError('PROTECTED_SCRIPT', `Script '${script.name ?? script.id}' defines the acting agent or the running workflow (or is called by it) and cannot be changed by it.`);
    }
    const self = await ManagementGuardService.actorAgent(prisma, actor);
    if (self) {
      // A script shared with agents outside the actor's sub-agent tree would change their behaviour too.
      const users = await prisma.agent.findMany({ where: { scriptId: script.id, existent: true }, select: { id: true, name: true } });
      for (const u of users) {
        const ancestors = await ManagementGuardService.agentAncestorIds(prisma, u.id);
        if (u.id === self.id || !ancestors.includes(self.id)) {
          throw new ManagementGuardError('PROTECTED_SCRIPT', `Script '${script.name ?? script.id}' is used by agent '${u.name}', which is not a sub-agent of '${self.name}'.`);
        }
      }
    }
    await ManagementGuardService.assertWritableProject(prisma, actor, script.projectId);
  }

  /** Throws unless the actor may grant `roleKeys` (ids or names) to the agent `target`. */
  static async assertCanGrantRoles(prisma: PrismaClient | any, actor: ManagementActor, target: { id: string; name?: string; projectId?: string | null }, roleKeys: string[]): Promise<void> {
    await ManagementGuardService.assertCanManageAgent(prisma, actor, target);
    await ManagementGuardService.assertHoldsRoles(prisma, actor, roleKeys);
  }

  /** Throws when an acting agent does not hold every role in `roleKeys` itself (directly or inherited). */
  static async assertHoldsRoles(prisma: PrismaClient | any, actor: ManagementActor, roleKeys: string[]): Promise<void> {
    const self = await ManagementGuardService.actorAgent(prisma, actor);
    if (!self || roleKeys.length === 0) return; // Humans: RBAC on the grant tool decides.
    const own = await prisma.agentRole.findMany({ where: { agentId: self.id }, include: { role: true } });
    const ownKeys = own.flatMap((r: any) => [r.roleId, r.role?.name].filter(Boolean));
    const held = new Set(await AgentRoleService.resolveInheritedRoleNames(prisma, ownKeys));
    for (const key of ownKeys) held.add(String(key));
    const missing = roleKeys.filter((k) => !held.has(k));
    if (missing.length > 0) {
      throw new ManagementGuardError('PRIVILEGE_ESCALATION', `Agent '${self.name}' cannot grant roles it does not hold: [${missing.join(', ')}].`);
    }
  }

  /** Throws unless the actor may rename/delete the project `projectId` (agents: strict sub-projects of the workspace only). */
  static async assertCanManageProject(prisma: PrismaClient | any, actor: ManagementActor, projectId: string): Promise<void> {
    if (projectId === SYSTEM_PROJECT_ID) {
      throw new ManagementGuardError('OUT_OF_WORKSPACE', `The '${SYSTEM_PROJECT_ID}' project cannot be managed by tools.`);
    }
    if (actor.agentId) {
      if (!actor.projectId || projectId === actor.projectId) {
        throw new ManagementGuardError('FORBIDDEN_SELF_MUTATION', `Agent '${actor.agentId}' cannot modify its own workspace project; only its sub-projects.`);
      }
      const self = await ManagementGuardService.actorAgent(prisma, actor);
      if (self?.projectId && (await isProjectWithin(prisma, self.projectId, projectId))) {
        throw new ManagementGuardError('FORBIDDEN_ANCESTOR_MUTATION', `Project '${projectId}' contains the definition of agent '${self.name}'.`);
      }
      if (!(await getProjectAncestorIds(prisma, projectId)).includes(actor.projectId)) {
        throw new ManagementGuardError('OUT_OF_WORKSPACE', `Project '${projectId}' is not a sub-project of workspace '${actor.projectId}'.`);
      }
      return;
    }
    await ManagementGuardService.assertWritableProject(prisma, actor, projectId);
  }
}
