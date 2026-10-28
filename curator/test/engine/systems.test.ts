import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runScript, saveScript } from '../helpers/harness.ts';
import { validateCuratorAst } from '../../src/engine/CuratorAstValidation.ts';
import {
  defineModule, defineSubroutine, defineEvent, defineStates, system, stateMachine, tool,
} from '../../src/engine/builder/CuratorCoreBuilder.ts';

const Phase = { DEAL: 'DEAL', BET: 'BET' } as const;
const phases = defineStates('phase', Phase);
const Bet = defineEvent<{ amount: number }>('bet');

// A tiny game: a state machine announces its transitions; systems react to states and events.
const game = () => defineModule('game', () => {
  system({ on: phases.entered(Phase.BET), run: defineSubroutine('on_bet_entered', [tool('record', { what: 'entered BET' })]) });
  system({ on: Bet, runIf: phases.in(Phase.BET), run: defineSubroutine('log_bet', [tool('record', { what: '$params.event.amount' })]) });
  system({ on: Bet, runIf: phases.in(Phase.DEAL), run: defineSubroutine('never', [tool('record', { what: 'wrong phase' })]) });
  return stateMachine(Phase.DEAL, {
    [Phase.DEAL]: { run: tool('deal'), next: Phase.BET },
    [Phase.BET]: { run: Bet.emit({ amount: 20 }) },
  }, { stateKey: phases });
});

test('systems: state-entered triggers and in-state run conditions start handlers as their own flows', async () => {
  const env = await createEnv('systems', { deal: () => ({ ok: 1 }), record: (a: any) => ({ got: a.what }) });
  try {
    const mod: any = game();
    assert.equal((validateCuratorAst(mod) as any).valid, true);
    assert.deepEqual(mod.subscriptions.map((s: any) => s.eventName), ['state:phase', 'bet', 'bet']);

    const saved = await saveScript(env, 'game', mod);
    const { result } = await runScript(env, saved.scriptId, saved.version);
    assert.equal(result.done, true);

    const recorded = env.calls.filter((c) => c.tool === 'record').map((c) => c.args.what).sort();
    assert.deepEqual(recorded, [20, 'entered BET']);

    const transitions = (await env.prisma.eventLog.findMany({ where: { eventName: 'state:phase' }, orderBy: { id: 'asc' } }))
      .map((e: any) => (typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload));
    assert.deepEqual(transitions, [{ from: null, to: 'DEAL' }, { from: 'DEAL', to: 'BET' }, { from: 'BET', to: '__end__' }]);
  } finally {
    await env.cleanup();
  }
});
