import type { NodeHandler } from './NodeHandler.js';
import { logger } from '../../utils/logger.js';

/** Spawns `thenBranch` or `elseBranch` and completes when the branch wakes it up. */
export const ifElseNode: NodeHandler = {
  type: 'Curator_IfElse',
  async run(ast, req, ctx) {
    logger.debug(`[CuratorRequestProcessor] Handling IfElse node for ${req.id}`);

    if (req.context?.ifElseEvaluated) {
      // The branch finished and woke us up.
      await ctx.saveResponse(req, `IfElse completed branch.`);
      await ctx.completeRequest(req.id, 'COMPLETED');
      return;
    }

    const conditionResult = await ctx.evaluateExpression(ast.condition, req);
    const branchToExecute = conditionResult ? ast.thenBranch : ast.elseBranch;

    if (branchToExecute) {
      await ctx.spawnChildAndParkParent(req, { ast: branchToExecute, context: req.context }, { ifElseEvaluated: true });
    } else {
      await ctx.saveResponse(req, `IfElse condition evaluated to ${conditionResult}. No branch executed.`);
      await ctx.completeRequest(req.id, 'COMPLETED');
    }
  },
};
