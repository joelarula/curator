import type { NodeHandler } from './NodeHandler.js';
import { logger } from '../../utils/logger.js';

/**
 * Curator_Interrupt handler — Play / Pause / Stop for a conversation.
 *
 * mode: 'stop'  (default) — cancels all NEW requests below cancelBelowPriority, then runs handler.
 * mode: 'pause'           — suspends (PAUSED status) all NEW requests below priority, runs handler, then resumes them.
 * mode: 'play'            — resumes all PAUSED requests in this conversation.
 */
export const interruptNode: NodeHandler<any> = {
  type: 'Curator_Interrupt',
  async run(ast, req, ctx) {
    const priority: number = ast.priority ?? 100;
    const cancelThreshold: number = ast.cancelBelowPriority ?? priority;
    const mode: 'stop' | 'pause' | 'play' = ast.mode ?? 'stop';

    logger.debug(`[CuratorRequestProcessor] Interrupt (mode=${mode}, priority=${priority}) for conversation ${req.conversationId}`);

    if (mode === 'play') {
      // Resume all PAUSED requests in this conversation
      const resumed = await ctx.prisma.request.updateMany({
        where: {
          conversationId: req.conversationId,
          status: 'PAUSED'
        },
        data: { status: 'NEW', lockedBy: null, lockedAt: null }
      });
      logger.debug(`[CuratorRequestProcessor] Resumed ${resumed.count} paused requests.`);
      await ctx.saveResponse(req, JSON.stringify({ status: 'play', resumed: resumed.count }));
      await ctx.completeRequest(req.id, 'COMPLETED');
      return;
    }

    if (mode === 'pause') {
      // Wake-up after the handler: the pause already happened on the first pass.
      if (req.context?.interruptHandled) {
        await ctx.saveResponse(req, JSON.stringify({ status: 'pause', handled: true }));
        await ctx.completeRequest(req.id, 'COMPLETED');
        return;
      }

      // Suspend all NEW requests below threshold
      const paused = await ctx.prisma.request.updateMany({
        where: {
          conversationId: req.conversationId,
          status: 'NEW',
          priority: { lt: cancelThreshold }
        },
        data: { status: 'PAUSED' }
      });
      logger.debug(`[CuratorRequestProcessor] Paused ${paused.count} requests.`);

      // Run handler if provided
      if (ast.handler) {
        await ctx.createRequest({
          data: {
            userId: req.userId,
            conversationId: req.conversationId,
            status: 'NEW',
            priority,
            pendingDependencies: 0,
            notifyId: req.id,
            ast: ast.handler
          }
        });
        // Park until the handler finishes; `interruptHandled` makes the wake-up complete instead of pausing again.
        // No Response while parked: the poller treats a WAITING Request with a Response as answered.
        await ctx.prisma.request.update({
          where: { id: req.id },
          data: { status: 'WAITING', pendingDependencies: 1, lockedBy: null, lockedAt: null, context: { ...(req.context || {}), interruptHandled: true } }
        });
      } else {
        await ctx.saveResponse(req, JSON.stringify({ status: 'pause', paused: paused.count }));
        await ctx.completeRequest(req.id, 'COMPLETED');
      }
      return;
    }

    // mode === 'stop': cancel all pending requests below threshold
    const cancelled = await ctx.prisma.request.updateMany({
      where: {
        conversationId: req.conversationId,
        status: 'NEW',
        priority: { lt: cancelThreshold }
      },
      data: { status: 'FAILED' }
    });
    logger.debug(`[CuratorRequestProcessor] Cancelled ${cancelled.count} lower-priority requests.`);

    // Run the interrupt handler at high priority
    if (ast.handler) {
      // If resume is provided, handler notifies the resume node
      let notifyId = req.notifyId;
      if (ast.resume) {
        const resumeReq = await ctx.createRequest({
          data: {
            userId: req.userId,
            conversationId: req.conversationId,
            status: 'NEW',
            priority: 0,
            pendingDependencies: 1,
            notifyId: req.notifyId,
            ast: ast.resume
          }
        });
        notifyId = resumeReq.id;
      }

      await ctx.createRequest({
        data: {
          userId: req.userId,
          conversationId: req.conversationId,
          status: 'NEW',
          priority,
          pendingDependencies: 0,
          notifyId,
          ast: ast.handler
        }
      });
    }

    await ctx.saveResponse(req, JSON.stringify({ status: 'stop', cancelled: cancelled.count }));
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};
