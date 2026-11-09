import { actorFromToolContext } from '../services/ManagementGuardService.js';

/** Projects of the calling session (`toolContext.projectId`); scope never comes from tool arguments. */
export const sessionProjects = (ctx: Record<string, any>): string[] => (ctx.projectId != null ? [String(ctx.projectId)] : []);

/**
 * The calling user, for tools only people may use (answering prompts, approving tool calls, forking runs).
 * Throws when an agent is the actor or no user is known.
 */
export function requireHumanCaller(ctx: Record<string, any>, toolName: string): string {
  const actor = actorFromToolContext(ctx);
  if (actor.agentId) throw new Error(`${toolName} is for human callers; agent '${actor.agentId}' cannot use it`);
  if (!actor.userId) throw new Error(`${toolName} needs the calling user`);
  return actor.userId;
}
