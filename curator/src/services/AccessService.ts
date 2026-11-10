import type { PrismaClient } from '@prisma/client';
import { AgentRoleService, type ActorIdentity } from './AgentRoleService.js';

/** What can be used: a tool (run), an agent (address), a secret (resolve). */
export type AccessKind = 'tool' | 'agent' | 'secret';

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
        default:
          return { allowed: false, reason: `Access Denied: unknown access kind '${String(kind)}'.` };
      }
    } catch (err: any) {
      return { allowed: false, reason: `Access Denied: the ${kind} check for '${name}' failed: ${err?.message ?? err}` };
    }
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
