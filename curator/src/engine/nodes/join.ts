import type { NodeHandler } from './NodeHandler.js';
import type { CuratorJoinNode } from '../CuratorAst.js';
import { logger } from '../../utils/logger.js';

export const joinNode: NodeHandler<CuratorJoinNode> = {
  type: 'Curator_Join',
  async run(ast, req, ctx) {
    logger.debug(`[CuratorRequestProcessor] Executing Join Node for request ${req.id}`);
    const children = await ctx.store.requests.find({ notifyId: req.id, status: 'COMPLETED' });
    if (children.length === 0) {
      await ctx.saveResponse(req, `ERROR: all parallel branches failed`);
      await ctx.completeRequest(req.id, 'FAILED');
      return;
    }
    const responses = await ctx.store.responses.latestFor(children.filter(c => c.output == null).map(c => c.id));
    const combinedTexts = children.map(c => c.output ?? responses.get(c.id)?.content ?? '').join('\n\n---\n\n');
    await ctx.saveResponse(req, `[Joined Output]\n${combinedTexts}`);
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};
