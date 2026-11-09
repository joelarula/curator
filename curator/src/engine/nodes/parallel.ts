import type { NodeHandler } from './NodeHandler.js';
import type { CuratorParallelNode } from '../CuratorAst.js';
import { BRANCH_KEY, MERGE_RULES_KEY, rulesOf } from '../StateMerge.js';

/** Join context keys (read by the Join node and by branch failure handling). */
export const JOIN_SINCE_KEY = '__joinSince';
export const JOIN_BRANCHES_KEY = '__joinBranches';
export const JOIN_SPEC_KEY = '__joinSpec';

export const parallelNode: NodeHandler<CuratorParallelNode> = {
  type: 'Curator_Parallel',
  async run(ast, req, ctx) {
    const subAgents = ast.subAgents;
    if (!subAgents || subAgents.length === 0) { await ctx.completeRequest(req.id, 'COMPLETED'); return; }

    const parentContext = ctx.parseContext(req.context);
    const parentScope = parentContext.__scope;
    const branchNames = subAgents.map((sub: any, i: number) => String(sub.name ?? `branch${i}`));
    // Rules of this parallel's branches: the enclosing parallel's, then this one's
    const parallelRules = ast.stateSchema ? rulesOf(parentContext[MERGE_RULES_KEY], ast.stateSchema) : undefined;
    // State events after this one were written while the branches ran (the Join checks them for conflicts)
    const head = ctx.prisma.eventLog?.findFirst
      ? await ctx.prisma.eventLog.findFirst({ where: { conversationId: req.conversationId }, orderBy: { id: 'desc' }, select: { id: true } })
      : null;

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
        context: {
          ...(parentScope != null ? { __joinScope: parentScope } : {}),
          // The continuation after the Join belongs to the parallel's parent: its branch and rules
          ...(parentContext[BRANCH_KEY] ? { [BRANCH_KEY]: parentContext[BRANCH_KEY] } : {}),
          ...(parentContext[MERGE_RULES_KEY] ? { [MERGE_RULES_KEY]: parentContext[MERGE_RULES_KEY] } : {}),
          [JOIN_SINCE_KEY]: head?.id ?? 0,
          [JOIN_BRANCHES_KEY]: branchNames,
          [JOIN_SPEC_KEY]: {
            strict: ast.strict,
            rules: parallelRules ?? null,
            isolate: !!ast.isolate,
            mergeBack: !!ast.mergeBack,
            as: ast.join?.as,
            requires: ast.join?.requires ?? 'any',
            onBranchFailure: ast.join?.onBranchFailure ?? 'continue',
          },
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
        ...(parallelRules ? { [MERGE_RULES_KEY]: parallelRules } : {}),
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
