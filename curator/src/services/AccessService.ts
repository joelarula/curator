import type { PrismaClient } from '@prisma/client';
import { AgentRoleService, type ActorIdentity } from './AgentRoleService.js';
import { getProjectSubtreeIds, SYSTEM_PROJECT_ID } from './ProjectScopeService.js';

/** What can be used: a tool (run), an agent (address), a secret (resolve), an action (perform, e.g. `db.export`). */
export type AccessKind = 'tool' | 'agent' | 'secret' | 'action';

/**
 * Host actions that need a role (besides super-admins). Harness commands that only change the viewer's screen or
 * engine state (clear, layout, workflow editor, pause) need none.
 */
export const CURATOR_ACTION_ROLES: Readonly<Record<string, string>> = {
  /** Database health: row counts of requests, agents, users, ... (`/status`). */
  'db.status': 'curator:db:status',
  /** Download the whole database file (`/export`). */
  'db.export': 'curator:db:export',
  /** Replace the database file. */
  'db.import': 'curator:db:import',
  /** Read other users' requests and responses in the project (request inspectors); otherwise only one's own. */
  'requests.read_all': 'curator:requests:read',
  /** Join channels of the project (checked by the default channel workflow, `access_check`). */
  'channels.join': 'channels:join',
};

export interface AccessPolicy {
  /** Role that grants use (tool or agent definition `requiredRole`). */
  requiredRole?: string;
  accessLevel?: string;
}

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
  roleNames?: string[];
}

/**
 * One allow-list check for calls and listings (engine, host, GraphQL, MCP, console): roles only, project scoped,
 * narrowed along the chain (an agent acting for a user needs both), denied when it cannot be decided.
 */
export class AccessService {
  static async canUse(
    prisma: PrismaClient | any,
    actor: ActorIdentity,
    kind: AccessKind,
    name: string,
    policy: AccessPolicy = {}
  ): Promise<AccessDecision> {
    try {
      switch (kind) {
        case 'tool':
          return await AgentRoleService.validateActorToolAccess(prisma, actor, name, { name, ...policy });
        case 'agent':
          return await AgentRoleService.validateAgentAddressAccess(prisma, actor, name, policy);
        case 'secret':
          return await AgentRoleService.validateAgentSecretAccess(prisma, actor?.agentId ?? null, name);
        case 'action': {
          const role = policy.requiredRole ?? CURATOR_ACTION_ROLES[name];
          // Unknown actions are super-admin only
          return await AgentRoleService.validateActionAccess(prisma, actor, name, role ? [role] : []);
        }
        default:
          return { allowed: false, reason: `Access Denied: unknown access kind '${String(kind)}'.` };
      }
    } catch (err: any) {
      return { allowed: false, reason: `Access Denied: the ${kind} check for '${name}' failed: ${err?.message ?? err}` };
    }
  }

  /**
   * Prisma `where` for the requests (and their responses) an actor may read: its project, the project's sub-projects
   * and `system`; only its own requests unless it may perform `requests.read_all`. No user: nothing.
   * `rolesPrisma` is the database holding the roles (definitions), the result filters the requests database.
   */
  static async requestScopeWhere(rolesPrisma: PrismaClient | any, actor: ActorIdentity): Promise<Record<string, any>> {
    const userId = actor?.userId != null ? String(actor.userId) : null;
    if (!userId) return { id: -1 };
    const projectId = actor?.projectId != null ? String(actor.projectId) : null;
    const projectIds = projectId ? [...new Set([...(await getProjectSubtreeIds(rolesPrisma, projectId)), SYSTEM_PROJECT_ID])] : null;
    const all = (await AccessService.canUse(rolesPrisma, actor, 'action', 'requests.read_all')).allowed;
    return {
      ...(projectIds ? { projectId: { in: projectIds } } : {}),
      ...(all ? {} : { userId }),
    };
  }

  /** Which of `actions` the actor may perform (for showing or hiding commands). */
  static async allowedActions(prisma: PrismaClient | any, actor: ActorIdentity, actions: string[]): Promise<string[]> {
    return AccessService.filterUsable(prisma, actor, 'action', actions, (name) => ({ name }));
  }

  /** The items the actor may use, in order (for listings: tools, agents). */
  static async filterUsable<T>(
    prisma: PrismaClient | any,
    actor: ActorIdentity,
    kind: AccessKind,
    items: T[],
    describe: (item: T) => { name: string; policy?: AccessPolicy }
  ): Promise<T[]> {
    const out: T[] = [];
    for (const item of items) {
      const { name, policy } = describe(item);
      if ((await AccessService.canUse(prisma, actor, kind, name, policy)).allowed) out.push(item);
    }
    return out;
  }
}
