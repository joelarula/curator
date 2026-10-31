import type { NodeHandler } from './NodeHandler.js';
import type { CuratorParallelNode } from '../CuratorAst.js';
import { logger } from '../../utils/logger.js';

export const parallelNode: NodeHandler<CuratorParallelNode> = {
  type: 'Curator_Parallel',
  async run(ast, req, ctx) {
    const subAgents = ast.subAgents;
    if (!subAgents || subAgents.length === 0) { await ctx.completeRequest(req.id, 'COMPLETED'); return; }

    const parentScope = ctx.parseContext(req.context).__scope;
    const joinReq = await ctx.createRequest({
      data: {
        userId: req.userId,
        projectId: req.projectId,
        agentId: req.agentId,
        scriptId: req.scriptId,
        conversationId: req.conversationId,
        status: 'NEW',
        pendingDependencies: subAgents.length,
        notifyId: req.notifyId,
        ast: { type: 'Curator_Join', name: `${ast.name || 'parallel'}_join` },
        ...(parentScope != null ? { context: { __joinScope: parentScope } } : {})
      }
    });

    for (const [i, sub] of subAgents.entries()) {
      let nodeAst = sub as any;
      if (ast.prompt && !nodeAst.prompt) nodeAst.prompt = ast.prompt;
      // Isolated branches get a private scope named after the branch (unique within this parallel).
      const branchContext = ast.isolate
        ? { ...ctx.parseContext(req.context), __scope: String(nodeAst.name ?? `branch${i}`) }
        : req.context;
      await ctx.createRequest({
        data: {
          userId: req.userId,
          projectId: req.projectId,
          agentId: req.agentId,
          scriptId: req.scriptId,
          conversationId: req.conversationId,
          status: 'NEW',
          pendingDependencies: 0,
          notifyId: joinReq.id,
          ast: nodeAst,
          context: branchContext,
          priority: nodeAst.priority,
          scheduledAt: ctx.resolveScheduledAt(nodeAst) ?? null
        }
      });
    }
    // The join node assumes responsibility for notifying our parent.
    await ctx.prisma.request.update({ where: { id: req.id }, data: { notifyId: null } });
    await ctx.completeRequest(req.id, 'COMPLETED', true);
  },
};
