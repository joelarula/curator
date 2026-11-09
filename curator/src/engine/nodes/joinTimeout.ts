import type { NodeHandler } from './NodeHandler.js';
import { JOIN_TIMED_OUT_KEY } from './join.js';

/**
 * Curator_JoinTimeout (internal, scheduled by a Curator_Parallel with `join.timeoutMs`): when it runs and the Join
 * is still waiting, the unfinished branches are cancelled and the Join runs now, reporting them as TIMEOUT.
 */
export const joinTimeoutNode: NodeHandler<any> = {
  type: 'Curator_JoinTimeout',
  async run(ast, req, ctx) {
    const closed = await ctx.closeJoin(Number(ast.joinId), { [JOIN_TIMED_OUT_KEY]: true }, 'join timeout');
    await ctx.saveResponse(req, JSON.stringify({ joinId: ast.joinId, timedOut: closed }));
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};
