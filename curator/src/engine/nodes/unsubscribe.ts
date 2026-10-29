import type { NodeHandler } from './NodeHandler.js';
import type { CuratorUnsubscribeNode } from '../CuratorAst.js';
import type { CuratorStructuredResponse } from '../CuratorContracts.js';
import { logger } from '../../utils/logger.js';

/** Dynamic Curator_Unsubscribe: deactivates conversation-scoped subscriptions (all, or for one handler). */
export const unsubscribeNode: NodeHandler<CuratorUnsubscribeNode> = {
  type: 'Curator_Unsubscribe',
  async run(ast, req, ctx) {
    if (!ctx.prisma.eventSubscription) return ctx.failRequest(req, 'EventSubscription model is not available');
    try {
      const handlerWhere = ast.handler ? await ctx.resolveHandler(ast.handler, req) : {};
      const res = await ctx.prisma.eventSubscription.updateMany({
        where: { eventName: ast.eventName, conversationId: req.conversationId, isActive: true, ...handlerWhere },
        data: { isActive: false }
      });
      const record: CuratorStructuredResponse = {
        type: 'UNSUBSCRIBED',
        ok: true,
        metadata: { eventName: ast.eventName, handler: ast.handler ?? null, count: res?.count ?? 0 }
      };
      await ctx.saveResponse(req, JSON.stringify(record));
      await ctx.completeRequest(req.id, 'COMPLETED');
    } catch (err: any) {
      return ctx.failRequest(req, `Unsubscribe '${ast.eventName}': ${err.message}`);
    }
  },
};
