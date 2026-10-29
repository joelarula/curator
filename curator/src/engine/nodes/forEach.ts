import type { NodeHandler } from './NodeHandler.js';
import { logger } from '../../utils/logger.js';

export const forEachNode: NodeHandler<any> = {
  type: 'Curator_ForEach',
  async run(ast, req, ctx) {
    logger.debug(`[CuratorRequestProcessor] Handling ForEach node for ${req.id}`);
    
    let collection = req.context?.forEachCollection;
    if (!collection) {
      collection = await ctx.evaluateExpression(ast.collectionExpression, req);
    }

    if (!Array.isArray(collection) || collection.length === 0) {
      await ctx.saveResponse(req, `ForEach finished (empty).`);
      await ctx.completeRequest(req.id, 'COMPLETED');
      return;
    }

    let currentIndex = req.context?.forEachIndex || 0;
    
    if (currentIndex >= collection.length) {
      await ctx.saveResponse(req, `ForEach finished.`);
      await ctx.completeRequest(req.id, 'COMPLETED');
      return;
    }

    const item = collection[currentIndex];
    const iteratorName = ast.iteratorName || 'item';
    
    await ctx.spawnChildAndParkParent(
      req,
      { ast: ast.body, context: { ...req.context, [iteratorName]: item }, parentId: req.id },
      { forEachIndex: currentIndex + 1, forEachCollection: collection }
    );
  },
};
