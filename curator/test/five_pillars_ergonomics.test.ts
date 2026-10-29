import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defineModule,
  defineEvent,
  defineStates,
  defineReducer,
  defineTool,
  createWorkflowScope,
  actorRef,
  waitAnyEvent,
  raceEvents,
  withFallback,
  withTimeout,
  withHooks,
  system,
  seq,
  validateCuratorAst,
  CuratorAccessLevel,
} from '../src/index.js';

interface DemoPlayer {
  id: string;
  name: string;
  chips: number;
  isHuman?: boolean;
}

interface DemoState {
  counter: number;
  status: 'idle' | 'running' | 'failed';
  players: DemoPlayer[];
  errorMsg?: string;
}

interface DemoContext {
  choice?: string | { id: string; value: string };
  tableResult?: { tableId: string };
  winnerEvent?: { sender?: string; responder?: string; _eventName?: string };
}

interface DemoParams {
  seatIndex: number;
  targetId: string;
}

describe('Curator 5 Ergonomic Pillars', () => {
  it('Pillar 1 & 5: createWorkflowScope, Rich Typed Proxy DSL, Array/String/Ternary & Callback Proxies', () => {
    const { state, ctx, params, setState, ifElse } =
      createWorkflowScope<DemoState, DemoContext, DemoParams>();

    assert.equal(String(state.counter.add(1)), '($state.counter + 1)');
    assert.equal(String(state.counter.orDefault(0).lt(2)), '(($state.counter || 0) < 2)');
    assert.equal(String(state.counter.orDefault(0).add(1)), '(($state.counter || 0) + 1)');
    assert.equal(String(state.players.at(params.seatIndex).chips.gte(100)), '($state.players[$params.seatIndex].chips >= 100)');
    assert.equal(String(ctx.choice.isChoice('JOIN_TABLE')), "($context.choice.id == 'JOIN_TABLE' or $context.choice == 'JOIN_TABLE' or $context.choice.value == 'JOIN_TABLE')");
    assert.equal(String(ctx.choice.isCommand('EXIT')), "(($context.choice && $context.choice.type == 'EXIT') || $context.choice == 'EXIT')");
    assert.equal(String(state.status.in('idle', 'running')), "($state.status == 'idle' or $state.status == 'running')");
    assert.equal(String(state.status.eq('idle').and(state.counter.gt(0).not())), "(($state.status == 'idle') and not ($state.counter > 0))");
    assert.equal(String(state.errorMsg.optional()), '{$state.errorMsg?}');
    assert.equal(String(state.errorMsg.nonEmpty()), 'Boolean($state.errorMsg && String($state.errorMsg).trim())');
    assert.equal(String(state.errorMsg.upper()), "String($state.errorMsg || '').toUpperCase()");
    assert.equal(String(state.status.eq('idle').ternary('READY', 'BUSY')), "(($state.status == 'idle') ? 'READY' : 'BUSY')");

    // Higher-order collection proxy methods (.find, .findBy, .some, .map)
    assert.equal(
      String(state.players.find((p) => p.id.eq(params.targetId))),
      '($state.players || []).find((__item) => (__item.id == $params.targetId))'
    );
    assert.equal(
      String(state.players.findBy('id', params.targetId)),
      '($state.players || []).find((__item) => __item.id == $params.targetId)'
    );
    assert.equal(
      String(state.players.some((p) => p.chips.gt(500))),
      '($state.players || []).some((__item) => (__item.chips > 500))'
    );
    assert.equal(
      String(state.players.map((p) => ({ id: p.id, isHuman: p.isHuman.toBoolean() }))),
      '($state.players || []).map((__item) => ({ "id": __item.id, "isHuman": Boolean(__item.isHuman) }))'
    );

    // Proxy methods work both directly AND inside `(c) => ...` callbacks
    const directNode = ifElse(
      state.counter.orDefault(0).lt(3),
      setState({ counter: state.counter.orDefault(0).add(1) })
    );
    assert.equal(directNode.condition, '(($state.counter || 0) < 3)');

    const callbackNode = ifElse(
      (c) => c.state.counter.orDefault(0).lt(3),
      setState((c) => ({ counter: c.state.counter.orDefault(0).add(1) }))
    );
    assert.equal(callbackNode.condition, '(($state.counter || 0) < 3)');
    assert.deepEqual((callbackNode.thenBranch as any).state, { counter: '(($state.counter || 0) + 1)' });

    // Typed actorRef kind callback
    const actorNode = actorRef(state.players.at(0), { human: '#h', llm: '#ai' }, {
      kind: (a) => a.isHuman.ternary('human', 'llm'),
    });
    assert.equal(actorNode.kind, "($actor.isHuman ? 'human' : 'llm')");
  });

  it('Pillar 2: First-Class Callable Tools & Reducers', async () => {
    const createTableTool = defineTool<{ tableName: string; startingChips?: number }>({
      name: 'demo_create_table',
      description: 'Creates a demo table',
      accessLevel: CuratorAccessLevel.SAFE_WRITE,
      parameters: { type: 'object', properties: { tableName: { type: 'string' } } },
      execute: async (args) => ({ tableId: `tbl_${args.tableName}`, chips: args.startingChips ?? 1000 }),
    });

    const { state } = createWorkflowScope<DemoState, DemoContext, DemoParams>();

    // Calling tool as workflow AST builder with { as } defaults spread to false
    const toolNode = createTableTool({ tableName: 'HighRoller', startingChips: state.counter }, { as: 'tableResult' });
    assert.equal(toolNode.type, 'Curator_Tool');
    assert.equal(toolNode.toolName, 'demo_create_table');
    assert.equal(toolNode.as, 'tableResult');
    assert.equal(toolNode.spread, false);
    assert.deepEqual(toolNode.args, { tableName: 'HighRoller', startingChips: '$state.counter' });

    // Calling reducer both as pure function and as workflow AST builder
    const scoreReducer = defineReducer<{ base: number; bonus: number }, { total: number }>(
      'demo_score_reducer',
      (args) => ({ total: args.base + args.bonus })
    );

    assert.deepEqual(scoreReducer({ base: 10, bonus: 5 }), { total: 15 });
    const reduceNode = scoreReducer.reduce({ base: state.counter, bonus: 10 });
    assert.equal(reduceNode.type, 'Curator_Reduce');
    assert.equal(reduceNode.reducer, 'demo_score_reducer');
    assert.notEqual(reduceNode.spread, false);

    const reduceNodeNamed = scoreReducer.reduce({ base: state.counter, bonus: 10 }, { as: 'scoreResult' });
    assert.equal(reduceNodeNamed.as, 'scoreResult');
    assert.equal(reduceNodeNamed.spread, false);
  });

  it('Pillar 3 & 4: Inline Reactive Systems, Event Racing & Node Modifiers', () => {
    const PingEvent = defineEvent<{ sender: string }>('demo:ping');
    const PongEvent = defineEvent<{ responder: string }>('demo:pong');
    const Phase = defineStates<'idle' | 'running' | 'failed'>('status');
    const { state, ctx, setState, ifElse } = createWorkflowScope<DemoState, DemoContext, DemoParams>();

    const mod = defineModule('demo_reactive', () => {
      // Inline Event.on callback auto-synthesizes a subroutine in module scope
      PingEvent.on((payload) =>
        PongEvent.emit({ responder: payload.sender })
      );

      // Inline system() callback with typed proxy runIf (using Phase.notIn) and payload
      system({
        on: PongEvent,
        runIf: Phase.notIn('idle', 'failed'),
        run: (payload) => setState({ errorMsg: payload.responder }),
      });

      const racedWait = raceEvents([PingEvent, PongEvent], ctx.winnerEvent, {
        timeoutSeconds: 15,
        onTimeout: setState({ status: 'failed' }),
      });

      const branchOnWinner = ifElse(
        PingEvent.is(ctx.winnerEvent),
        setState({ errorMsg: ctx.winnerEvent.sender }),
        setState({ errorMsg: ctx.winnerEvent.responder })
      );

      const resilientStep = withHooks(
        withFallback(
          [racedWait, branchOnWinner],
          setState({ status: 'failed', errorMsg: 'fallback_triggered' })
        ),
        {
          entry: setState({ status: 'running' }),
          exit: setState({ counter: state.counter.add(1) }),
        }
      );

      return seq(resilientStep);
    });

    const validation = validateCuratorAst(mod);
    assert.equal(validation.valid, true, `AST validation failed: ${validation.errors?.join(', ')}`);
    assert.equal(mod.subscriptions?.length, 2);
    assert.equal(Object.keys(mod.subroutines ?? {}).length, 2);

    const waitNode = waitAnyEvent([PingEvent, 'custom:cancel'], 'raceOut', { timeoutSeconds: 5 });
    const timedWait = withTimeout(waitNode, 10, setState({ status: 'failed' }));
    assert.equal(timedWait.eventName, 'demo:ping');
    assert.deepEqual(timedWait.eventNames, ['custom:cancel']);
    assert.equal(timedWait.timeoutSeconds, 10);
    assert.ok(timedWait.onTimeout);
  });
});
