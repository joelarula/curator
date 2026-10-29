import type { NodeHandler } from './NodeHandler.js';
import { logger } from '../../utils/logger.js';

/** Evaluates `expression` into state `key` and refreshes the Request's context.state. */
export const assignNode: NodeHandler = {
  type: 'Curator_Assign',
  async run(ast, req, ctx) {
    logger.debug(`[CuratorRequestProcessor] Handling Assign node for ${req.id}`);
    const evaluatedValue = await ctx.evaluateExpression(ast.expression, req);

    const updateObj: Record<string, any> = {};
    updateObj[ast.key] = evaluatedValue;

    const scope = ctx.parseContext(req.context).__scope;
    await ctx.writeState(req.conversationId, scope, updateObj);
    const newState = await ctx.readState(req.conversationId, scope);

    // Also update req.context.state for subsequent operations in this loop
    const newContext = { ...(req.context || {}), state: newState };
    await ctx.prisma.request.update({
      where: { id: req.id },
      data: { context: newContext }
    });

    await ctx.saveResponse(req, `Assigned ${ast.key} = ${JSON.stringify(evaluatedValue)}`);
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};
