import type { NodeHandler } from './NodeHandler.js';
import type { CuratorJoinNode } from '../CuratorAst.js';
import { logger } from '../../utils/logger.js';
import { LATEST_RESPONSE, requestOutput } from '../StepTrace.js';

export const joinNode: NodeHandler<CuratorJoinNode> = {
  type: 'Curator_Join',
  async run(ast, req, ctx) {
    logger.debug(`[CuratorRequestProcessor] Executing Join Node for request ${req.id}`);
    const children = await ctx.prisma.request.findMany({
      where: { notifyId: req.id, status: 'COMPLETED' },
      include: LATEST_RESPONSE
    });
    if (children.length === 0) {
      await ctx.saveResponse(req, `ERROR: all parallel branches failed`);
      await ctx.completeRequest(req.id, 'FAILED');
      return;
    }
    const combinedTexts = children.map((c: any) => requestOutput(c) || '').join('\n\n---\n\n');
    await ctx.saveResponse(req, `[Joined Output]\n${combinedTexts}`);
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};
