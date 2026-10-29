import type { NodeHandler } from './NodeHandler.js';
import type { CuratorSubscribeNode } from '../CuratorAst.js';
import type { CuratorStructuredResponse } from '../CuratorContracts.js';
import { logger } from '../../utils/logger.js';

/** Dynamic Curator_Subscribe: materializes a conversation-scoped EventSubscription bound to the handler's Script. */
export const subscribeNode: NodeHandler<CuratorSubscribeNode> = {
  type: 'Curator_Subscribe',
  async run(ast, req, ctx) {
    if (!ctx.prisma.eventSubscription) return ctx.failRequest(req, 'EventSubscription model is not available');
    if (ast.scope === 'project') {
      return ctx.failRequest(req, `Project-scoped subscriptions must be declared in Curator_Module.subscriptions (static)`);
    }
    try {
      const { scriptId, entry } = await ctx.resolveHandler(ast.handler, req);
      const where = { scriptId, entry, eventName: ast.eventName, conversationId: req.conversationId };
      const data = {
        isActive: true,
        when: ast.when ?? null,
        payloadAs: ast.as ?? null,
        userId: req.userId,
        projectId: req.projectId ?? null,
        agentId: req.agentId ?? null
      };
      const found = await ctx.prisma.eventSubscription.findFirst({ where });
      const row = found
        ? await ctx.prisma.eventSubscription.update({ where: { id: found.id }, data })
        : await ctx.prisma.eventSubscription.create({ data: { ...where, ...data } });
      const record: CuratorStructuredResponse = {
        type: 'SUBSCRIBED',
        ok: true,
        metadata: { subscriptionId: row.id, eventName: ast.eventName, handler: ast.handler }
      };
      await ctx.saveResponse(req, JSON.stringify(record));
      await ctx.completeRequest(req.id, 'COMPLETED');
    } catch (err: any) {
      return ctx.failRequest(req, `Subscribe '${ast.eventName}': ${err.message}`);
    }
  },
};
