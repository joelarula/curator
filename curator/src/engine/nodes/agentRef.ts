import type { NodeHandler } from './NodeHandler.js';
import { runCall } from './call.js';
import { logger } from '../../utils/logger.js';

/** Calls an Agent's script as a subroutine (input forwarded), looked up by id or name. */
export const agentRefNode: NodeHandler<any> = {
  type: 'Curator_AgentRef',
  async run(ast, req, ctx) {
    const context = req.context;
    if (context?.callPending) return runCall({ type: 'Curator_Call', ref: '', as: ast.as } as any, req, ctx);

    const agentDef = ast.agentName
      ? await ctx.prisma.agent.findFirst({
          where: { OR: [{ id: ast.agentName }, { name: ast.agentName }] },
          include: { script: { select: { name: true } } }
        })
      : null;
    if (!agentDef?.script?.name) {
      const reason = !ast.agentName ? 'Missing agentName parameter' : `Agent '${ast.agentName}' not found or has no script`;
      logger.error(`[CuratorRequestProcessor] AgentRef failed for request ${req.id}: ${reason}`);
      await ctx.saveResponse(req, `[Agent Error] ${reason}`);
      await ctx.completeRequest(req.id, 'FAILED');
      return;
    }
    return runCall(
      { type: 'Curator_Call', ref: agentDef.script.name, args: { input: '$context.input' }, as: ast.as } as any,
      req,
      ctx,
      { agentId: agentDef.id }
    );
  },
};
