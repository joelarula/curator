import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createEnv,
  runAst,
  runScript,
  saveScript,
  snapshotDb,
} from '../../../curator/test/helpers/harness.ts';
import { POKER_WORKFLOW_ASTS } from '../src/session/pokerSession.ts';
import '../src/composables/pokerComposables.ts';
import { reduceTableTalk, DEFAULT_TALK_CONFIG } from '../src/engine/tableTalk.ts';

const MAX_DEPTH = DEFAULT_TALK_CONFIG.maxDepth;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKFLOWS_DIR = path.resolve(__dirname, '../src/workflows');

function loadScriptAst(name: string) {
  return POKER_WORKFLOW_ASTS[name];
}

const cannedMockTable = {
  tableId: 'table_test_1',
  street: 'PREFLOP',
  currentStreet: 'PREFLOP',
  pot: 60,
  sbAmount: 10,
  bbAmount: 20,
  activePlayerIdx: 0,
  handOver: false,
  gameOver: false,
  players: [
    { id: 'p1', name: 'Alice', chips: 980, currentBet: 20, folded: false, isHuman: false },
    { id: 'p2', name: 'Bob', chips: 980, currentBet: 20, folded: false, isHuman: false },
  ],
};

/** Canned table reducer: records each command and returns a fixed table step (no engine involved). */
function createPokerCannedTools(step: (command: any) => any = () => ({})): Record<string, (args: any) => any> {
  const mockTable = cannedMockTable;

  return {
    poker_table_command: (args: any) => {
      const command = args?.command || {};
      if (command.type === 'boot') {
        return {
          gameState: { ...mockTable, tableId: command.config?.tableId || mockTable.tableId },
          turn: null,
          events: [],
        };
      }
      return { gameState: mockTable, turn: null, events: [], ...step(command) };
    },
  };
}

const tableCommands = (env: any, type?: string) =>
  env.calls.filter((c: any) => c.reducer === 'poker_table_command' && (!type || c.args?.command?.type === type));

test('Poker Deterministic Harness: Module compilation and version registration', async () => {
  const env = await createEnv('poker_det_compile', createPokerCannedTools());
  try {
    const modules = [
      'poker_lobby',
      'poker_rules',
      'ambient_reaction',
      'agent_turn',
      'human_turn',
      'poker_workflow',
    ];

    for (const modName of modules) {
      const ast: any = await loadScriptAst(modName);
      assert.equal(ast.type, 'Curator_Module', `${modName} must compile to Curator_Module`);
      const saved = await saveScript(env, modName, ast);
      assert.ok(saved.scriptId > 0, `${modName} scriptId must be positive`);
      assert.equal(saved.version, 1, `${modName} version must be 1`);
      assert.ok(saved.hash, `${modName} must have a content hash`);
    }

    // Verify ambient_reaction static subscriptions were materialized into EventSubscription table
    const subs = await env.prisma.eventSubscription.findMany({ orderBy: { id: 'asc' } });
    assert.ok(subs.length >= 2, 'ambient_reaction should have materialized at least 2 subscriptions');
    const events = subs.map((s: any) => s.eventName);
    assert.ok(events.includes('poker:action_taken'), 'must have subscription for poker:action_taken');
    assert.ok(events.includes('poker:speech'), 'must have subscription for poker:speech');
  } finally {
    await env.cleanup();
  }
});

test('Poker Deterministic Harness: poker_lobby initializes table and emits table_ready', async () => {
  const canned = createPokerCannedTools();
  const env = await createEnv('poker_det_lobby', canned);
  try {
    const lobbyAst = await loadScriptAst('poker_lobby');
    const saved = await saveScript(env, 'poker_lobby', lobbyAst);

    const { requestId, result } = await runScript(env, saved.scriptId, saved.version, {
      context: {
        tableId: 'table_gold',
        startingChips: 1500,
        sbAmount: 15,
        bbAmount: 30,
      },
    });

    assert.equal(result.done, true, 'Lobby execution should complete synchronously');
    const rootReq = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(rootReq.status, 'COMPLETED');

    // The table is booted through the table reducer
    assert.equal(tableCommands(env, 'boot').length, 1, 'the table must be booted');

    // Tool output lands in the event-sourced state, which the workflow reads (`$state.gameState`)
    const { stateAt } = await import('../src/curator.ts');
    const state = await stateAt(env.prisma, env.conversationId);
    assert.equal(state.gameState?.tableId, 'table_gold');

    // The run's table config reaches the boot step instead of falling back to defaults
    const config = tableCommands(env, 'boot')[0]?.args?.command?.config;
    assert.equal(config?.tableId, 'table_gold');
    assert.equal(Number(config?.startingChips), 1500);
    assert.equal(Number(config?.sbAmount), 15);
    assert.equal(Number(config?.bbAmount), 30);
    assert.deepEqual(state.seatedPlayers, [
      { id: 'p1', name: 'Alice', isHuman: false },
      { id: 'p2', name: 'Bob', isHuman: false },
    ], 'seats are recorded without chips or cards');

    // Assert database snapshot is clean and stable
    const snap = await snapshotDb(env);
    assert.ok(snap.requests.length > 0);
    assert.ok(snap.requests.every((r: any) => r.status === 'COMPLETED'));
  } finally {
    await env.cleanup();
  }
});

test('Poker Deterministic Harness: agent_turn executes AI decision tool and action dispatch', async () => {
  const canned = createPokerCannedTools();
  const env = await createEnv('poker_det_agent', canned);
  try {
    env.useLlm([
      {
        text: JSON.stringify({
          action: { type: 'CALL', amount: 20 },
          speech: 'I call your bet.',
        }),
      },
    ]);

    const agentAst = await loadScriptAst('agent_turn');
    const saved = await saveScript(env, 'agent_turn', agentAst);

    // Game state lives in the event-sourced conversation state, as a prior engine step would leave it
    const { appendStatePatch } = await import('../src/curator.ts');
    await appendStatePatch(env.prisma, env.conversationId, {
      set: {
        gameState: {
          tableId: 'table_1',
          activePlayerIdx: 0,
          currentBet: 20,
          pot: 30,
          board: [],
          currentStreet: 'PREFLOP',
          players: [{ id: 'ai_1', name: 'SharkAI', chips: 1000, streetBet: 0 }],
        },
      },
    });

    const { requestId, result } = await runScript(env, saved.scriptId, saved.version);

    assert.equal(result.done, true);
    const rootReq = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(rootReq.status, 'COMPLETED');

    // The seat only decides (the table applies): the engine does not run, the action is the result
    assert.deepEqual(env.calls, []);
    const seatCall = (await env.prisma.request.findMany({ include: { responses: true } }))
      .find((r: any) => r.ast?.type === 'Curator_Call');
    assert.deepEqual(JSON.parse(seatCall.responses[0].content), { type: 'CALL', amount: 20 });

    // The decision's table talk is announced as speech from the seat
    const speech = await env.prisma.eventLog.findFirst({ where: { eventName: 'poker:speech' } });
    const payload = typeof speech?.payload === 'string' ? JSON.parse(speech.payload) : speech?.payload;
    assert.equal(payload?.speakerName, 'SharkAI');
    assert.equal(payload?.text, 'I call your bet.');
  } finally {
    await env.cleanup();
  }
});

test('Poker Deterministic Harness: rules systems validate and apply an intent; ambient reacts to the action', async () => {
  const turn = { seatId: 'p1', choices: [{ id: 'call', action: { type: 'CALL', amount: 20 } }, { id: 'fold', action: { type: 'FOLD' } }] };
  // The applied action keeps the seat to act, so the next intents are validated against the same choices
  const env = await createEnv('poker_det_rules', createPokerCannedTools((command) => ({
    turn,
    events: [{ name: 'poker:action_taken', payload: { player: 'Alice', action: command.action, summary: 'Alice acts.', gameState: cannedMockTable } }],
  })));
  try {
    // Systems-only modules: saving them materializes their subscriptions
    await saveScript(env, 'poker_rules', await loadScriptAst('poker_rules'));
    await saveScript(env, 'ambient_reaction', await loadScriptAst('ambient_reaction'));

    const { appendStatePatch } = await import('../src/curator.ts');
    await appendStatePatch(env.prisma, env.conversationId, {
      set: {
        tablePhase: 'SUBMIT',
        turn,
        gameState: { tableId: 'table_rules', activePlayerIdx: 0, currentBet: 20, pot: 30, players: [{ id: 'p1', name: 'Alice', chips: 980, streetBet: 0 }] },
      },
    });
    const intent = (action: any) => runAst(env, { type: 'Curator_EmitEvent', eventName: 'poker:action_intent', payload: { seatId: 'p1', action } });
    const resolutions = async () => (await env.prisma.eventLog.findMany({ where: { eventName: 'poker:action_resolved' }, orderBy: { id: 'asc' } }))
      .map((e: any) => (typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload));

    // An illegal intent is rejected back to the seat and nothing is applied
    await intent({ type: 'CHECK' });
    assert.deepEqual(tableCommands(env, 'act'), []);
    assert.equal((await resolutions()).at(-1)?.accepted, false);

    // A legal one is validated, applied and announced; the ambient system reacts to the announcement
    await intent({ type: 'CALL', amount: 20 });
    assert.deepEqual(tableCommands(env, 'act').map((c: any) => c.args.command.action), [{ type: 'CALL', amount: 20 }]);
    assert.equal((await resolutions()).at(-1)?.accepted, true);
    const names = (await env.prisma.eventLog.findMany({ orderBy: { id: 'asc' } })).map((e: any) => e.eventName);
    assert.ok(names.includes('poker:action_taken'));
    assert.ok(!names.includes('poker:chatter_cue'), 'a plain call is not worth table talk');

    // A seat that keeps sending illegal intents is sent back a bounded number of times, then coerced
    await intent({ type: 'CHECK' });
    await intent({ type: 'CHECK' });
    assert.equal(tableCommands(env, 'act').length, 1, 'still rejected (2 of 2)');
    await intent({ type: 'CHECK' });
    assert.equal(tableCommands(env, 'act').length, 2, 'third illegal intent is applied (sanitized)');
    assert.equal((await resolutions()).at(-1)?.accepted, true);

    // Outside the SUBMIT phase the rules do not run at all
    await appendStatePatch(env.prisma, env.conversationId, { set: { tablePhase: 'BETTING' } });
    await intent({ type: 'CALL', amount: 20 });
    assert.equal(tableCommands(env, 'act').length, 2);
  } finally {
    await env.cleanup();
  }
});

test('Poker Deterministic Harness: table talk with an always-talking LLM ends after MAX_DEPTH lines', async () => {
  const env = await createEnv('poker_det_table_talk', {
    poker_table_talk: (args: any) => reduceTableTalk(args.talk, args.gameState, args.command) as any,
  });
  try {
    await saveScript(env, 'ambient_reaction', await loadScriptAst('ambient_reaction'));
    const { appendStatePatch } = await import('../src/curator.ts');
    await appendStatePatch(env.prisma, env.conversationId, {
      set: {
        tablePhase: 'BETTING',
        gameState: {
          tableId: 'table_talk',
          players: [
            { id: 'hero', name: 'You (Hero)', isHuman: true },
            { id: 'viper', name: 'Viper (Shark)', persona: 'shark', instruction: 'Cold shark.' },
            { id: 'maddog', name: 'MadDog (Maniac)', persona: 'maniac', instruction: 'Loud maniac.', holeCards: ['As', 'Kd'], chips: 740 },
            { id: 'barnaby', name: 'Barnaby (Station)', persona: 'station', instruction: 'Folksy station.' },
          ],
        },
      },
    });
    // Worst case: every seat always talks and always calls out someone by name
    const llm = env.useLlm(() => JSON.stringify({ say: 'Viper, MadDog, Barnaby - answer me!' }));

    await runAst(env, {
      type: 'Curator_EmitEvent',
      eventName: 'poker:speech',
      payload: { speakerId: 'hero', speakerName: 'You', text: 'MadDog, you are bluffing', speechAct: 'TABLE_TALK' },
    });

    const payloads = async (name: string) => (await env.prisma.eventLog.findMany({ where: { eventName: name }, orderBy: { id: 'asc' } }))
      .map((e: any) => (typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload));
    const lines = (await payloads('poker:speech')).filter((p: any) => p.origin === 'chatter');
    assert.equal(lines[0]?.speakerId, 'maddog', 'the addressed seat answers first');
    assert.deepEqual(lines.map((p: any) => p.depth), [1, 2], 'one answer, one comeback, then the thread ends');
    assert.ok(new Set(lines.map((p: any) => p.threadId)).size === 1, 'one thread');
    assert.equal(llm.requests.length, MAX_DEPTH, 'one LLM call per line');
    // The seat talks as itself: its persona and its own view of the table, as on its turn
    const firstPrompt = JSON.stringify(llm.requests[0]);
    assert.match(firstPrompt, /You are MadDog \(Maniac\)/);
    assert.match(firstPrompt, /Loud maniac\./);
    assert.match(firstPrompt, /Your Hole Cards: .*As.*Kd/);
    assert.match(firstPrompt, /Your Stack: \[chips\] 740/);
    assert.equal((await payloads('poker:chatter_done')).length, MAX_DEPTH);

    const { stateAt } = await import('../src/curator.ts');
    assert.equal((await stateAt(env.prisma, env.conversationId)).talk?.open ?? null, null, 'the table is released');
  } finally {
    await env.cleanup();
  }
});

test('Poker Deterministic Harness: applying an action emits everything the table reported, in order', async () => {
  const snapshot = (street: string) => ({ ...cannedMockTable, currentStreet: street });
  const reported = [
    { name: 'poker:action_taken', payload: { player: 'Alice', action: { type: 'CALL' }, summary: 'Alice calls $20.', gameState: snapshot('PREFLOP') } },
    { name: 'poker:phase_street', payload: { street: 'FLOP', gameState: snapshot('FLOP') } },
    { name: 'poker:phase_street', payload: { street: 'TURN', gameState: snapshot('TURN') } },
    { name: 'poker:phase_settle', payload: { winnerSummary: 'Alice wins $60!', gameState: snapshot('SHOWDOWN') } },
    { name: 'poker:new_round', payload: { handNumber: 2, gameState: snapshot('PREFLOP') } },
  ];
  const env = await createEnv('poker_det_announce', createPokerCannedTools(() => ({ events: reported })));
  try {
    await saveScript(env, 'poker_rules', await loadScriptAst('poker_rules'));
    await runAst(env, { type: 'Curator_EmitEvent', eventName: 'poker:action_validated', payload: { seatId: 'p1', action: { type: 'CALL' } } });

    assert.deepEqual(tableCommands(env).map((c: any) => c.args.command), [{ type: 'act', action: { type: 'CALL' } }]);
    const logged = (await env.prisma.eventLog.findMany({ orderBy: { id: 'asc' } }))
      .map((e: any) => ({ name: e.eventName, payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload }))
      .filter((e: any) => e.name.startsWith('poker:') && e.name !== 'poker:action_validated');

    assert.deepEqual(logged.map((e: any) => e.name), [...reported.map((e) => e.name), 'poker:action_resolved'],
      'the reported events, then the turn is resolved');
    assert.deepEqual(logged.filter((e: any) => e.name === 'poker:phase_street').map((e: any) => e.payload.gameState.currentStreet), ['FLOP', 'TURN'],
      'each event keeps its own snapshot');
    assert.equal(logged.at(-1).payload.accepted, true);
  } finally {
    await env.cleanup();
  }
});

test('Poker Frontmatter Integrity: Workflows contain required frontmatter metadata', async () => {
  const workflowFiles = [
    'pokerWorkflow.ts',
    'pokerLobby.ts',
    'humanTurn.ts',
    'agentTurn.ts',
    'tableRules.ts',
    'ambientReaction.ts',
  ];

  for (const file of workflowFiles) {
    const raw = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
    assert.match(
      raw,
      /\/\*\*[\s\S]*?id:\s*\w+[\s\S]*?name:\s*\w+[\s\S]*?\*\//,
      `${file} must preserve header frontmatter block with id and name`,
    );
  }
});

test('Poker Typed TypeScript Workflows: All 6 modules validate and run deterministically', async () => {
  const {
    pokerWorkflowAst,
    pokerLobbyAst,
    humanTurnAst,
    agentTurnAst,
    pokerRulesAst,
    ambientReactionAst,
  } = await import('../src/workflows/index.ts');

  assert.equal(pokerWorkflowAst.type, 'Curator_Module');
  assert.equal(pokerWorkflowAst.name, 'poker_workflow');

  assert.equal(pokerLobbyAst.type, 'Curator_Module');
  assert.equal(pokerLobbyAst.name, 'poker_lobby');

  assert.equal(humanTurnAst.type, 'Curator_Module');
  assert.equal(humanTurnAst.name, 'human_turn');

  assert.equal(agentTurnAst.type, 'Curator_Module');
  assert.equal(agentTurnAst.name, 'agent_turn');

  assert.equal(pokerRulesAst.type, 'Curator_Module');
  assert.equal(pokerRulesAst.name, 'poker_rules');

  assert.equal(ambientReactionAst.type, 'Curator_Module');
  assert.equal(ambientReactionAst.name, 'ambient_reaction');
  assert.equal(ambientReactionAst.subscriptions?.length, 6);

  const canned = createPokerCannedTools();
  const env = await createEnv('poker_det_ts_workflow', canned);
  try {
    const saved = await saveScript(env, 'poker_workflow_ts', pokerWorkflowAst);
    assert.ok(saved.scriptId > 0);
    assert.equal(saved.version, 1);

  } finally {
    await env.cleanup();
  }
});

test('Poker TypeScript Context Models: Path proxies, type guards, and semantic shapes', async () => {
  const {
    ctx,
    gameState,
    state,
    params,
    isCard,
    isStreet,
    isPlayerAction,
    isPlayerState,
    isPokerGameState,
    pokerPlugin,
    pokerScripts,
    getScriptAST,
    PokerEvent,
    PokerTool,
    PokerStep,
    PokerModule,
    PokerSessionReason,
    PokerLobbyAction,
    PokerActionType,
  } = await import('../src/index.ts');
  const { toVarName } = await import('../src/curator.ts');

  // 1. Verify typed path proxy expression stringification
  assert.equal(String(ctx.gameState.currentStreet), '$context.gameState.currentStreet');
  assert.equal(String(ctx.gameState.pot), '$context.gameState.pot');
  assert.equal(String(ctx.gameState.players[0].chips), '$context.gameState.players.0.chips');
  assert.equal(String(ctx.humanAction.type), '$context.humanAction.type');
  assert.equal(String(ctx.openTables.tableChoices), '$context.openTables.tableChoices');
  assert.equal(String(gameState.board), '$state.gameState.board', 'game state is read from the event-sourced state');
  assert.equal(String(state.isPaused), '$state.isPaused');
  assert.equal(String(params.action), '$params.action');

  // 2. Verify model runtime type guards
  assert.equal(isCard({ rank: 'A', suit: '♠' }), true);
  assert.equal(isCard({ rank: 'Z', suit: '♠' }), false);
  assert.equal(isStreet('FLOP'), true);
  assert.equal(isStreet('RIVER'), true);
  assert.equal(isStreet('INVALID_STREET'), false);
  assert.equal(isPlayerAction({ type: 'CALL', amount: 20 }), true);
  assert.equal(isPlayerAction({ type: 'CHECK' }), true);
  assert.equal(isPlayerAction({ type: 'INVALID' as any }), false);
  assert.equal(isPokerGameState(cannedMockTable), true);

  // 3. Verify typed domain constants and variable name unwrapper
  assert.equal(PokerEvent.LOBBY_READY, 'poker:lobby_ready');
  assert.equal(PokerEvent.ACTION_TAKEN, 'poker:action_taken');
  assert.equal(PokerEvent.SESSION_EXITED, 'poker:session_exited');
  assert.equal(PokerTool.LIST_TABLES, 'poker_list_tables');
  assert.equal(PokerModule.WORKFLOW, 'poker_workflow');
  assert.equal(PokerStep.TABLE_PHASES, 'poker:table_phases');
  assert.equal(PokerSessionReason.USER_EXIT, 'user_exit');
  assert.equal(PokerLobbyAction.NEW, 'new');
  assert.equal(PokerActionType.PAUSE, 'PAUSE');
  assert.equal(toVarName(ctx.resumeCmd), 'resumeCmd');
  assert.equal(toVarName(ctx.humanAction), 'humanAction');
  assert.equal(toVarName(params.speechEvt), 'speechEvt');
  assert.equal(toVarName('customVar'), 'customVar');

  // 4. Verify typed workflow AST scripts registration on plugin
  assert.ok(pokerPlugin.scripts);
  assert.ok(pokerScripts.poker_workflow.ast);
  const scriptsMap = pokerPlugin.scripts as Record<string, any>;
  assert.equal(scriptsMap.poker_workflow.name, 'poker_workflow');
  assert.equal(scriptsMap.poker_lobby.name, 'poker_lobby');
  assert.equal(scriptsMap.human_turn.name, 'human_turn');
  assert.equal(scriptsMap.agent_turn.name, 'agent_turn');

  // 5. Verify getScriptAST returns typed AST directly without DB query
  const resolvedWorkflowAst = await getScriptAST(null, 'poker_workflow');
  assert.equal(resolvedWorkflowAst.name, 'poker_workflow');
  const resolvedLobbyAst = await getScriptAST(null, 'poker_lobby');
  assert.equal(resolvedLobbyAst.name, 'poker_lobby');
});


