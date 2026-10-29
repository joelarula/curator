import type { NodeHandler } from './NodeHandler.js';
import type { CuratorLoopNode } from '../CuratorAst.js';
import { AST_LIMITS } from '../CuratorAstValidation.js';
import { isValidSchedule, computeNextRunDate } from '../AgentScheduleSupervisor.js';
import { logger } from '../../utils/logger.js';

/**
 * Curator_Loop: runs `agent` once per iteration (`$context.iteration`, 1-based).
 * Stop conditions: `while` (checked before each iteration), `over` (iterate a collection, item bound to `as`),
 * `until` (checked after each iteration) and `maxIterations`.
 * With `schedule` it is the scheduler subtype: each iteration is queued for the next due time
 * (the loop then runs until cancelled unless bounded).
 */
export const loopNode: NodeHandler<CuratorLoopNode> = {
  type: 'Curator_Loop',
  async run(ast, req, ctx) {
    const loopContext = req.context || {};
    const running = !!loopContext.loopRunning;
    const completed: number = running ? (loopContext.loopIteration ?? 0) : 0;

    if (ast.schedule && !isValidSchedule(ast.schedule)) {
      return ctx.failRequest(req, `Loop schedule '${ast.schedule}' is not a valid cron or interval expression`);
    }

    const conv = await ctx.prisma.conversation.findUnique({ where: { id: req.conversationId } });
    req.context = { ...loopContext, state: ctx.getConversationState(conv), iteration: completed };

    let collection: any[] | undefined = loopContext.loopCollection;
    if (ast.over && !running) {
      collection = await ctx.evaluateExpression(ast.over, req);
      if (!Array.isArray(collection)) return ctx.failRequest(req, `Loop 'over' expression did not evaluate to an array`);
    }

    const limit = ast.maxIterations ?? (ast.schedule ? Infinity : AST_LIMITS.maxLoopIterations);
    let stop: string | null = null;
    if (running && completed >= limit) stop = 'maxIterations';
    else if (running && ast.until && await ctx.evaluateExpression(ast.until, req)) stop = 'until';
    else if (collection && completed >= collection.length) stop = 'over';
    else if (ast.while && !(await ctx.evaluateExpression(ast.while, req))) stop = 'while';
    if (stop) {
      await ctx.saveResponse(req, `Loop finished after ${completed} iteration(s) (${stop}).`);
      await ctx.completeRequest(req.id, 'COMPLETED');
      return;
    }

    const iteration = completed + 1;
    const { loopIteration, loopRunning, loopCollection, ...inherited } = loopContext;
    const itemContext = collection ? { [ast.as || 'item']: collection[completed], index: completed } : {};
    const body: any = ast.prompt && !(ast.agent as any).prompt ? { ...ast.agent, prompt: ast.prompt } : ast.agent;
    const runNow = !ast.schedule || (ast.immediate && iteration === 1);
    await ctx.createRequest({
      data: {
        ast: body,
        context: { ...inherited, ...itemContext, iteration },
        projectId: req.projectId,
        agentId: req.agentId,
        scriptId: req.scriptId,
        conversationId: req.conversationId,
        userId: req.userId || 1,
        status: 'NEW',
        pendingDependencies: 0,
        notifyId: req.id,
        scheduledAt: runNow ? null : computeNextRunDate(ast.schedule!, new Date(ctx.now()))
      }
    });
    await ctx.prisma.request.update({
      where: { id: req.id },
      data: {
        status: 'WAITING',
        lockedBy: null,
        lockedAt: null,
        pendingDependencies: 1,
        context: { ...loopContext, loopIteration: iteration, loopRunning: true, ...(collection ? { loopCollection: collection } : {}) }
      }
    });
  },
};
