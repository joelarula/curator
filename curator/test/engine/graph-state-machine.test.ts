import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { rebuildStateSnapshot } from '../../src/engine/ConversationStateLog.ts';
import { validateCuratorAst } from '../../src/engine/CuratorAstValidation.ts';
import { stateMachine, tool } from '../../src/engine/builder/CuratorCoreBuilder.ts';

// Bevy-style round loop: Deal -> Bet -> Check, back to Deal until Check reports GAME_OVER.
function roundGraph() {
  return {
    type: 'Curator_Graph',
    name: 'Round Loop',
    startNode: 'Deal',
    stateKey: 'phase',
    nodes: {
      Deal: { type: 'Curator_Tool', toolName: 'deal', args: { phase: '$state.phase', tableId: '$context.tableId' } },
      Bet: { type: 'Curator_Tool', toolName: 'bet', args: { phase: '$state.phase' } },
      Check: { type: 'Curator_Tool', toolName: 'check' },
    },
    edges: {
      Deal: 'Bet',
      Bet: 'Check',
      Check: [
        { to: 'Deal', when: "output.status == 'CONTINUE'" },
        { to: '__end__' },
      ],
    },
    onEnter: { Bet: { type: 'Curator_Tool', toolName: 'enter_bet', args: { phase: '$state.phase' } } },
    onExit: { Bet: { type: 'Curator_Tool', toolName: 'exit_bet', args: { phase: '$state.phase' } } },
  };
}

test('graph: guarded edges, onEnter/onExit hooks and stateKey drive a round loop', async () => {
  let checks = 0;
  const env = await createEnv('graph_state_machine', {
    deal: () => ({ dealt: true }),
    bet: () => ({ bet: 10 }),
    check: () => ({ status: ++checks < 2 ? 'CONTINUE' : 'GAME_OVER' }),
    enter_bet: () => ({ ok: true }),
    exit_bet: () => ({ ok: true }),
  });
  try {
    const { requestId, result } = await runAst(env, roundGraph(), { context: { tableId: 'T1' } });
    assert.equal(result.done, true);
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');

    // States inherit the graph's context, like Sequential/While children.
    assert.deepEqual(env.calls.filter((c) => c.tool === 'deal').map((c) => c.args.tableId), ['T1', 'T1']);

    const round = ['deal', 'enter_bet', 'bet', 'exit_bet', 'check'];
    assert.deepEqual(env.calls.map((c) => c.tool), [...round, ...round]);

    // stateKey is the new state during its onEnter and body, and still the old one during onExit.
    const phaseOf = (tool: string) => env.calls.filter((c) => c.tool === tool).map((c) => c.args.phase);
    assert.deepEqual(phaseOf('deal'), ['Deal', 'Deal']);
    assert.deepEqual(phaseOf('enter_bet'), ['Bet', 'Bet']);
    assert.deepEqual(phaseOf('bet'), ['Bet', 'Bet']);
    assert.deepEqual(phaseOf('exit_bet'), ['Bet', 'Bet']);

    assert.equal((await rebuildStateSnapshot(env.prisma, env.conversationId)).state.phase, '__end__');
  } finally {
    await env.cleanup();
  }
});

test('graph: onExit runs on the way to __end__ and the graph completes with the state output', async () => {
  const env = await createEnv('graph_exit_on_end', {
    work: () => ({ done: 1 }),
    cleanup: () => ({ ok: true }),
  });
  try {
    const { requestId, result } = await runAst(env, {
      type: 'Curator_Graph',
      startNode: 'Work',
      nodes: { Work: { type: 'Curator_Tool', toolName: 'work' } },
      onExit: { Work: { type: 'Curator_Tool', toolName: 'cleanup' } },
    });
    assert.equal(result.done, true);
    assert.deepEqual(env.calls.map((c) => c.tool), ['work', 'cleanup']);
    const root = await env.prisma.request.findUnique({ where: { id: requestId }, include: { responses: true } });
    assert.equal(root.status, 'COMPLETED');
    assert.match(String(root.responses.at(-1)?.content), /"done":\s*1/, 'graph output is the state output, not the hook output');
  } finally {
    await env.cleanup();
  }
});

test('graph: stateMachine() builder compiles per-state hooks and function guards', async () => {
  let checks = 0;
  const env = await createEnv('graph_builder', {
    deal: () => ({ dealt: true }),
    check: () => ({ status: ++checks < 3 ? 'CONTINUE' : 'GAME_OVER' }),
    announce: () => ({ ok: true }),
  });
  try {
    const ast = stateMachine('Deal', {
      Deal: { onEnter: [tool('announce', { phase: '$state.phase' })], run: tool('deal'), next: 'Check' },
      Check: {
        run: tool('check'),
        next: [{ to: 'Deal', when: (c: any) => c.output.status === 'CONTINUE' }],
      },
    }, { stateKey: 'phase' });
    assert.equal((validateCuratorAst(ast) as any).valid, true);

    const { result } = await runAst(env, ast);
    assert.equal(result.done, true);
    assert.deepEqual(env.calls.map((c) => c.tool), Array(3).fill(['announce', 'deal', 'check']).flat());
    assert.deepEqual(env.calls.filter((c) => c.tool === 'announce').map((c) => c.args.phase), ['Deal', 'Deal', 'Deal']);
  } finally {
    await env.cleanup();
  }
});

test('graph: validation rejects transitions and hooks naming missing states', () => {
  const ast: any = roundGraph();
  ast.edges.Check = [{ to: 'Nowhere', when: 'true' }];
  ast.onEnter.Ghost = { type: 'Curator_Tool', toolName: 'x' };
  const { valid, errors } = validateCuratorAst(ast) as any;
  assert.equal(valid, false);
  assert.ok(errors.some((e: string) => e.includes("targets missing graph node 'Nowhere'")), errors.join('\n'));
  assert.ok(errors.some((e: string) => e.includes('onEnter/Ghost references missing graph node')), errors.join('\n'));

  assert.equal((validateCuratorAst(roundGraph()) as any).valid, true);
});

test('graph: a guarded startNode picks the initial state', async () => {
  const env = await createEnv('graph_conditional_start', { menu: () => ({ ok: 1 }), boot: () => ({ ok: 2 }) });
  try {
    const ast = stateMachine([{ to: 'Boot', when: '$context.tableId' }, { to: 'Menu' }], {
      Menu: { run: tool('menu'), next: 'Boot' },
      Boot: { run: tool('boot') },
    }, { stateKey: 'lobbyPhase' });
    assert.equal((validateCuratorAst(ast) as any).valid, true);

    await runAst(env, ast, { context: { tableId: 'T1' } });
    assert.deepEqual(env.calls.map((c) => c.tool), ['boot'], 'a preselected table skips the menu');
    assert.equal((await rebuildStateSnapshot(env.prisma, env.conversationId)).state.lobbyPhase, '__end__');
  } finally {
    await env.cleanup();
  }
});
