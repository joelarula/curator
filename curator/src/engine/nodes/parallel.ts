import type { NodeHandler } from './NodeHandler.js';
import type { CuratorJoinFanIn, CuratorParallelNode } from '../CuratorAst.js';
import { BRANCH_KEY, rulesOf } from '../StateMerge.js';

/** Join context key: the last state event before the branches started (the Join checks later ones for conflicts). */
export const JOIN_SINCE_KEY = '__joinSince';

export const parallelNode: NodeHandler<CuratorParallelNode> = {
  type: 'Curator_Parallel',
  async run(ast, req, ctx) {
    const subAgents = ast.subAgents;
    if (!subAgents || subAgents.length === 0) { await ctx.completeRequest(req.id, 'COMPLETED'); return; }

    const parentContext = ctx.parseContext(req.context);
    const parentScope = parentContext.__scope;
    const branchNames = subAgents.map((sub: any, i: number) => String(sub.name ?? `branch${i}`));
    const head = ctx.prisma.eventLog?.findFirst
      ? await ctx.prisma.eventLog.findFirst({ where: { conversationId: req.conversationId }, orderBy: { id: 'desc' }, select: { id: true } })
      : null;

    // The fan-in contract travels on the Join's node: configuration, read by the Join, the branches' state writes
    // (their merge rules) and branch failure handling
    const fanIn: CuratorJoinFanIn = {
      branches: branchNames,
      ...(ast.stateSchema ? { rules: rulesOf(ast.stateSchema) } : {}),
      ...(ast.strict !== undefined ? { strict: ast.strict } : {}),
      ...(ast.isolate ? { isolate: true } : {}),
      ...(ast.mergeBack ? { mergeBack: true } : {}),
      ...(ast.join?.as ? { as: ast.join.as } : {}),
      ...(ast.join?.requires ? { requires: ast.join.requires } : {}),
      ...(ast.join?.onBranchFailure ? { onBranchFailure: ast.join.onBranchFailure } : {}),
    };
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
        ast: { type: 'Curator_Join', name: `${ast.name || 'parallel'}_join`, fanIn },
        context: {
          ...(parentScope != null ? { __joinScope: parentScope } : {}),
          // The continuation after the Join belongs to the parallel's parent branch, if any
          ...(parentContext[BRANCH_KEY] ? { [BRANCH_KEY]: parentContext[BRANCH_KEY] } : {}),
          [JOIN_SINCE_KEY]: head?.id ?? 0,
        },
      }
    });

    for (const [i, sub] of subAgents.entries()) {
      let nodeAst = sub as any;
      if (ast.prompt && !nodeAst.prompt) nodeAst.prompt = ast.prompt;
      const name = branchNames[i];
      const branchContext = {
        ...parentContext,
        // Isolated branches get a private scope named after the branch (unique within this parallel).
        ...(ast.isolate ? { __scope: name } : {}),
        [BRANCH_KEY]: { join: joinReq.id, name },
      };
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

    // A deadline for the branches: a scheduled timer closes the Join if they are not all back by then
    if (ast.join?.timeoutMs && ast.join.timeoutMs > 0) {
      await ctx.createRequest({
        data: {
          userId: req.userId,
          projectId: req.projectId,
          agentId: req.agentId,
          scriptId: req.scriptId,
          conversationId: req.conversationId,
          status: 'NEW',
          pendingDependencies: 0,
          ast: { type: 'Curator_JoinTimeout', joinId: joinReq.id },
          scheduledAt: new Date(ctx.now() + ast.join.timeoutMs),
        }
      });
    }
    // The join node assumes responsibility for notifying our parent.
    await ctx.completeRequest(req.id, 'COMPLETED', true, { notifyId: null });
  },
};
