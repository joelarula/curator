import type { NodeHandler } from './NodeHandler.js';
import { logger } from '../../utils/logger.js';

export const whileNode: NodeHandler<any> = {
  type: 'Curator_While',
  async run(ast, req, ctx) {
    logger.debug(`[CuratorRequestProcessor] Handling While node for ${req.id}`);
    
    // We need fresh state to evaluate condition properly across iterations
    const conv = await ctx.prisma.conversation.findUnique({ where: { id: req.conversationId } });
    req.context = req.context || {};
    req.context.state = ctx.getConversationState(conv);

    const conditionResult = await ctx.evaluateExpression(ast.condition, req);
    
    if (conditionResult) {
      await ctx.spawnChildAndParkParent(req, { ast: ast.body, context: req.context });
    } else {
      await ctx.saveResponse(req, `While loop finished.`);
      await ctx.completeRequest(req.id, 'COMPLETED');
    }
  },
};
