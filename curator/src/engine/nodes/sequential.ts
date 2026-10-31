import type { CuratorSequentialNode } from '../CuratorAst.js';
import type { NodeHandler } from './NodeHandler.js';

/** Pre-spawns the children as a notify chain; each child unblocks the next, the last one notifies our parent. */
export const sequentialNode: NodeHandler<CuratorSequentialNode> = {
  type: 'Curator_Sequential',
  async run(ast, req, ctx) {
    const subAgents = ast.subAgents;
    if (!subAgents || subAgents.length === 0) { await ctx.completeRequest(req.id, 'COMPLETED'); return; }

    let currentNotifyId = req.notifyId;
    for (let i = subAgents.length - 1; i >= 0; i--) {
      const isFirst = i === 0;
      let nodeAst = subAgents[i] as any;
      if (isFirst && ast.prompt && !nodeAst.prompt) nodeAst.prompt = ast.prompt;

      const newReq = await ctx.createRequest({
        data: {
          userId: req.userId,
          projectId: req.projectId,
          agentId: req.agentId,
          scriptId: req.scriptId,
          conversationId: req.conversationId,
          status: 'NEW',
          pendingDependencies: isFirst ? 0 : 1,
          notifyId: currentNotifyId,
          ast: nodeAst,
          context: isFirst ? req.context : undefined,
          priority: nodeAst.priority,
          scheduledAt: ctx.resolveScheduledAt(nodeAst) ?? null
        }
      });
      currentNotifyId = newReq.id;
    }
    // The last child spawned assumes responsibility for notifying our parent.
    await ctx.prisma.request.update({ where: { id: req.id }, data: { notifyId: null } });
    await ctx.completeRequest(req.id, 'COMPLETED', true);
  },
};
