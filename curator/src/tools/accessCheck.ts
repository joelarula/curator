import { defineTool, type CuratorToolContext } from './CuratorTool.js';
import { AccessService } from '../services/AccessService.js';
import { AgentRoleService } from '../services/AgentRoleService.js';

type Ctx = CuratorToolContext & Record<string, any>;

/**
 * For workflow policies (e.g. who may join a channel): whether the sender of the event being handled
 * (`context.emittedBy`, set by the engine) holds a role or may perform a host action. Without a sender, the caller.
 * Same allow-list rules as everywhere (project scope, inheritance, super-admins pass).
 */
export const access_check = defineTool<{ role?: string; action?: string }>({
  name: 'access_check',
  description:
    'Whether the sender of the event being handled (else the caller) holds a role or may perform an action; returns { allowed, reason }. For workflow conditions.',
  accessLevel: 'read_only',
  parameters: {
    type: 'object',
    properties: {
      role: { type: 'string', description: 'A role name the subject must hold (super-admins pass).' },
      action: { type: 'string', description: 'A host action (e.g. channels.join, db.export).' },
    },
  },
  execute: async (args, ctx: Ctx) => {
    if (!args.role && !args.action) throw new Error("access_check needs 'role' or 'action'");
    const by = ctx.context?.emittedBy;
    const subject = by && (by.userId || by.agentId)
      ? { userId: by.userId ?? null, agentId: by.agentId ?? null, projectId: by.projectId ?? ctx.projectId ?? null }
      : { userId: ctx.userId ?? null, agentId: ctx.agentId ?? null, projectId: ctx.projectId ?? null };
    const decision = args.action
      ? await AccessService.canUse(ctx.prisma, subject, 'action', String(args.action))
      : await AgentRoleService.validateActionAccess(ctx.prisma, subject, `hold role '${args.role}'`, [String(args.role)]);
    return { allowed: decision.allowed, reason: decision.allowed ? null : decision.reason ?? null };
  },
});

export const accessCheckTools = { access_check };
