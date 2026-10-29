import {
  serializeClosure,
  type CuratorAstNode,
  type CuratorExpr,
  type CuratorEventEmitResult,
  type CuratorStructuredResponse,
  type NodeHandler,
} from '../curator.ts';
import { PokerNodeType, PokerReducer } from '../models/index.ts';
import type { PokerGameState } from '../types.ts';
import type { PokerTableCommandInput, PokerTableStep } from '../engine/pokerTable.ts';

/** `Poker_Table` AST node: `args` are `PokerTableParams` expressions, evaluated like `Curator_Reduce` args. */
export interface PokerTableNode {
  type: typeof PokerNodeType.TABLE;
  args: string | Record<string, any>;
}

/**
 * One table step as a single system (Bevy-style): runs the table reducer, writes its `gameState`, `turn` and
 * `events` to `$state` and the request context, then emits the events in order. State is written first, so the
 * rule systems the events wake up already see the new table. The engine is still reached only through the
 * `poker_table_command` reducer (looked up in the engine, so hosts and tests can replace it).
 */
export const pokerTableNode: NodeHandler<PokerTableNode> = {
  type: PokerNodeType.TABLE,
  validate: (node) =>
    node.args && (typeof node.args === 'string' || typeof node.args === 'object') ? [] : ['args must be an object or an expression'],
  async run(node, req, ctx) {
    const reducer = ctx.tools.reducer(PokerReducer.TABLE);
    if (!reducer) throw new Error(`Reducer ${PokerReducer.TABLE} not found in dynamic registry.`);

    let args: Record<string, any>;
    if (ctx.isDynamicExpr(node.args)) {
      const resolved = await ctx.evaluateExpression(node.args, req);
      args = resolved && typeof resolved === 'object' && !Array.isArray(resolved) ? resolved : { input: resolved };
    } else {
      args = await ctx.evaluateArgs(node.args, req);
    }

    const output = reducer(args);
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      throw new Error(`Reducer ${PokerReducer.TABLE} must return an object`);
    }
    // Same data the reduce + emitEvents pair saw: the step as it round-trips through the database
    const step: PokerTableStep = JSON.parse(JSON.stringify(output));

    const updatedContext = { ...(req.context || {}), ...step };
    req.context = updatedContext;
    await ctx.prisma.request.update({ where: { id: req.id }, data: { context: updatedContext } });
    await ctx.writeState(req.conversationId, ctx.parseContext(req.context).__scope, step as Record<string, any>);

    const events: CuratorEventEmitResult[] = [];
    for (const spec of step.events || []) {
      if (!spec || typeof spec.name !== 'string' || !spec.name) {
        throw new Error(`${PokerNodeType.TABLE}: every event needs a name (got ${JSON.stringify(spec)})`);
      }
      const payload: any = spec.payload && typeof spec.payload === 'object' && !Array.isArray(spec.payload)
        ? { ...spec.payload }
        : spec.payload;
      ctx.events.addOrigin(payload, req);
      ctx.emit(spec.name, payload);
      events.push(await ctx.events.dispatch(spec.name, payload, req));
    }
    // A structured record: the step is already in `$state`, so completion must not merge it a second time
    const record: CuratorStructuredResponse = { type: 'EVENTS_EMITTED', ok: true, events };
    await ctx.saveResponse(req, JSON.stringify(record));
    await ctx.completeRequest(req.id, 'COMPLETED');
  },
};

/** Builds a `Poker_Table` node; `state` and `command` may be typed path proxies or expressions. */
export function pokerTable(args: {
  state: CuratorExpr<PokerGameState | null | undefined>;
  command: CuratorExpr<PokerTableCommandInput>;
}): CuratorAstNode {
  return { type: PokerNodeType.TABLE, args: serializeClosure(args) } as unknown as CuratorAstNode;
}

export const pokerNodeHandlers: NodeHandler[] = [pokerTableNode];
