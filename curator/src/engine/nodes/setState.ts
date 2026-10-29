import type { NodeHandler } from './NodeHandler.js';
import { logger } from '../../utils/logger.js';

/** Writes an evaluated object (literal args or a `$` expression) into the conversation state. */
export const setStateNode: NodeHandler = {
  type: 'Curator_SetState',
  async run(ast, req, ctx) {
    logger.debug(`[CuratorRequestProcessor] Setting state for request ${req.id}`);
    let evaluatedState: Record<string, any> = {};
    if (ctx.isDynamicExpr(ast.state)) {
      const res = await ctx.evaluateExpression(ast.state, req);
      if (res && typeof res === 'object' && !Array.isArray(res)) {
        evaluatedState = res;
      }
    } else if (ast.state && typeof ast.state === 'object') {
      evaluatedState = await ctx.evaluateArgs(ast.state, req);
    }

    if (Object.keys(evaluatedState).length > 0) {
      await ctx.writeState(req.conversationId, ctx.parseContext(req.context).__scope, evaluatedState);
      await ctx.saveResponse(req, JSON.stringify({ status: 'State updated', state: evaluatedState }));
    } else {
      await ctx.saveResponse(req, JSON.stringify({ status: 'No state provided' }));
    }
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};
