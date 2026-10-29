import type { NodeHandler } from './NodeHandler.js';
import { logger } from '../../utils/logger.js';

export const waitEventNode: NodeHandler<any> = {
  type: 'Curator_WaitEvent',
  async run(ast, req, ctx) {
    const allEvents: string[] = Array.from(new Set([ast.eventName, ...(Array.isArray(ast.eventNames) ? ast.eventNames : [])].filter(Boolean)));
    if (ctx.prisma.eventLog && !req.context?.__humanInputReceived__) {
      const cursor = await ctx.events.resolveCursor(req.id, req.conversationId, !!ast.replay);
      const identity = ctx.events.identityOf(req);
      const myFlow = await ctx.events.flowChain(req.id);
      // The emitting flow never hears its own events, but events other flows logged meanwhile are kept.
      const candidates = await ctx.prisma.eventLog.findMany({
        where: {
          conversationId: req.conversationId,
          eventName: allEvents.length === 1 ? allEvents[0] : { in: allEvents },
          id: { gt: cursor },
          OR: identity ? [{ target: null }, { target: identity }] : [{ target: null }],
        },
        orderBy: { id: 'asc' },
      });
      let missed: any = null;
      for (const c of candidates) {
        if (c.source != null) {
          const theirs = c.source === req.id ? myFlow : await ctx.events.flowChain(c.source);
          if ([...theirs].some((id) => myFlow.has(id))) continue;
        }
        missed = c;
        break;
      }
      if (missed) {
        // Emitted while this flow was between waits: deliver it as if it had woken us.
        logger.debug(`[CuratorRequestProcessor] Request ${req.id} consumed buffered event '${missed.eventName}' (#${missed.id}).`);
        await ctx.events.advanceCursor(req.id, missed.id);
        let value = missed.payload;
        if (allEvents.length > 1 && value && typeof value === 'object' && !Array.isArray(value) && value._eventName === undefined) {
          value = { ...value, _eventName: missed.eventName };
        }
        const patch: Record<string, any> = {};
        if (allEvents.length > 1) patch.lastWokenEvent = missed.eventName;
        if (ast.payloadAlias) patch[ast.payloadAlias] = value;
        if (Object.keys(patch).length > 0) {
          await ctx.writeState(req.conversationId, ctx.parseContext(req.context).__scope, patch);
        }
        await ctx.saveResponse(req, typeof value === 'string' ? value : JSON.stringify(value ?? {}));
        await ctx.completeRequest(req.id, 'COMPLETED');
        return;
      }
      await ctx.events.advanceCursor(req.id, cursor);
    }
    if (req.context?.__humanInputReceived__) {
      delete req.context.__humanInputReceived__;
      // Woken by dispatchEvent: the payload is already bound to the alias in context/state.
      const received = ast.payloadAlias ? req.context[ast.payloadAlias] : req.context.input;
      await ctx.saveResponse(req, typeof received === 'string' ? received : JSON.stringify(received ?? {}));
      await ctx.completeRequest(req.id, 'COMPLETED');
      return;
    }
    logger.debug(`[CuratorRequestProcessor] Request ${req.id} paused, waiting for event '${allEvents.join(' | ')}'.`);
    const updatedContext: any = {
      ...(req.context || {}),
      waitEvent: ast.eventName,
      ...(allEvents.length > 1 ? { waitEvents: allEvents } : {}),
      payloadAlias: ast.payloadAlias,
    };
    delete updatedContext.waitDeadline;
    if (ast.timeoutSeconds > 0) updatedContext.waitDeadline = new Date(ctx.now() + ast.timeoutSeconds * 1000).toISOString();
    await ctx.prisma.request.update({
      where: { id: req.id },
      data: { status: 'WAITING_FOR_EVENT', context: updatedContext }
    });
  },
};
