import type { NodeHandler } from './NodeHandler.js';
import type { CuratorActorRefNode } from '../CuratorAst.js';
import { runCall } from './call.js';
import { logger } from '../../utils/logger.js';

/** Dispatches to a handler subroutine chosen by the actor's kind; the resolved actor is bound as a param. */
export const actorRefNode: NodeHandler<CuratorActorRefNode> = {
  type: 'Curator_ActorRef',
  async run(ast, req, ctx) {
    if (ctx.parseContext(req.context).callPending) return runCall({ type: 'Curator_Call', ref: '', as: ast.as } as any, req, ctx);

    const actor = await ctx.evaluateExpression(ast.actor, req);
    const kind = await ctx.evaluateExpression(ast.kind ?? '$actor.kind', { ...req, context: { ...ctx.parseContext(req.context), $actor: actor } });
    const ref = ast.handlers[String(kind)] ?? ast.handlers.default;
    if (!ref) return ctx.failRequest(req, `ActorRef: no handler for kind '${kind}'`);
    logger.debug(`[CuratorRequestProcessor] ActorRef ${req.id} dispatching kind '${kind}' to '${ref}'.`);
    // The actor is already resolved: bind it as a param instead of re-evaluating its fields as expressions.
    return runCall({ type: 'Curator_Call', ref, args: ast.args, as: ast.as } as any, req, ctx, { params: { actor } });
  },
};
