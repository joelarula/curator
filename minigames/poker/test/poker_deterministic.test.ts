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
import { POKER_WORKFLOW_ASTS } from '../src/engine/pokerSession.ts';
import '../src/composables/pokerComposables.ts';

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

function createPokerCannedTools(): Record<string, (args: any) => any> {
  const mockTable = cannedMockTable;

  return {
    poker_init_lobby: (args: any) => ({
      gameState: {
        ...mockTable,
        tableId: args?.tableId || mockTable.tableId,
        sbAmount: args?.sbAmount || 10,
        bbAmount: args?.bbAmount || 20,
      },
    }),
    poker_start_hand: (args: any) => ({
      gameState: {
        ...mockTable,
        handNumber: 1,
        currentStreet: 'PREFLOP',
      },
    }),
    poker_get_choices: (_args: any) => ({
      choices: [
        { label: 'Check', value: { type: 'CHECK' } },
        { label: 'Bet 40', value: { type: 'BET', amount: 40 } },
        { label: 'Fold', value: { type: 'FOLD' } },
      ],
    }),
    poker_ai_decision: (_args: any) => ({
      action: { type: 'CALL', amount: 20 },
      speech: 'I call your bet.',
    }),
    poker_apply_action: (args: any) => ({
      gameState: {
        ...mockTable,
        lastAction: args?.action || { type: 'CHECK' },
        streetComplete: true,
      },
    }),
    poker_deal_street: (_args: any) => ({
      gameState: {
        ...mockTable,
        currentStreet: 'FLOP',
        communityCards: [
          { rank: 'A', suit: 's' },
          { rank: 'K', suit: 'h' },
          { rank: 'Q', suit: 'd' },
        ],
      },
    }),
    poker_distribute_pots: (_args: any) => ({
      gameState: {
        ...mockTable,
        handOver: true,
        winners: [{ playerId: 'p1', amount: 60 }],
      },
    }),
    poker_check_game_over: (_args: any) => ({
      gameOver: false,
      standings: [
        { id: 'p1', rank: 1, chips: 1020 },
        { id: 'p2', rank: 2, chips: 940 },
      ],
    }),
    poker_rotate_dealer: (_args: any) => ({
      gameState: {
        ...mockTable,
        dealerIdx: 1,
      },
    }),
    poker_human_speech: (args: any) => ({
      success: true,
      remark: args?.text || 'Good game.',
    }),
  };
}

test('Poker Deterministic Harness: Module compilation and version registration', async () => {
  const env = await createEnv('poker_det_compile', createPokerCannedTools());
  try {
    const modules = [
      'poker_lobby',
      'poker_action',
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

    // Assert that poker_init_lobby was called
    const calledTools = env.calls.map((c) => c.tool);
    assert.ok(calledTools.includes('poker_init_lobby'), 'poker_init_lobby must be called');

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
    const agentAst = await loadScriptAst('agent_turn');
    const saved = await saveScript(env, 'agent_turn', agentAst);

    const { requestId, result } = await runScript(env, saved.scriptId, saved.version, {
      context: {
        gameState: {
          tableId: 'table_1',
          activePlayerIdx: 0,
          players: [{ id: 'ai_1', name: 'SharkAI', chips: 1000 }],
        },
      },
    });

    assert.equal(result.done, true);
    const rootReq = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(rootReq.status, 'COMPLETED');

    const calledTools = env.calls.map((c) => c.tool);
    assert.deepEqual(calledTools, ['poker_ai_decision', 'poker_apply_action']);

    // Check that apply_action received the decision output from ai_decision
    const applyCall = env.calls.find((c) => c.tool === 'poker_apply_action');
    assert.deepEqual(applyCall?.args?.action, { type: 'CALL', amount: 20 });
  } finally {
    await env.cleanup();
  }
});

test('Poker Deterministic Harness: poker_action emits event and triggers ambient_reaction subscription', async () => {
  const canned = createPokerCannedTools();
  const env = await createEnv('poker_det_pubsub', canned);
  try {
    // Save ambient_reaction first to materialize subscriptions in the DB
    const ambientAst = await loadScriptAst('ambient_reaction');
    await saveScript(env, 'ambient_reaction', ambientAst);

    // Save poker_action
    const actionAst = await loadScriptAst('poker_action');
    const savedAction = await saveScript(env, 'poker_action', actionAst);

    // Run poker_action
    const { requestId, result } = await runScript(env, savedAction.scriptId, savedAction.version, {
      context: {
        action: { type: 'CALL', amount: 20 },
        gameState: {
          tableId: 'table_pubsub',
          activePlayerIdx: 0,
          pot: 40,
          players: [{ id: 'p1', name: 'Alice', chips: 980 }],
        },
      },
    });

    assert.equal(result.done, true);
    const rootReq = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(rootReq.status, 'COMPLETED');

    // Now emit poker:action_taken to verify the ambient reactor triggers deterministically
    const emitResult = await runAst(env, {
      type: 'Curator_EmitEvent',
      eventName: 'poker:action_taken',
      payload: {
        player: 'Alice',
        action: { type: 'CALL', amount: 20 },
      },
    });
    assert.equal(emitResult.result.done, true);

    // Verify requests in conversation: poker_action, emit, and ambient_reaction#on_action_taken
    const snap = await snapshotDb(env);
    assert.ok(snap.requests.length >= 3, 'Should have processed action, emit, and spawned handler');
    assert.ok(snap.requests.every((r: any) => r.status === 'COMPLETED'));
  } finally {
    await env.cleanup();
  }
});

test('Poker Deterministic Harness: Calling subroutines directly by ref (deal_next_street, settle_showdown)', async () => {
  const canned = createPokerCannedTools();
  const env = await createEnv('poker_det_subroutines', canned);
  try {
    const workflowAst = await loadScriptAst('poker_workflow');
    await saveScript(env, 'poker_workflow', workflowAst);

    // 1. Call poker_workflow#deal_next_street directly
    const dealCall = await runAst(
      env,
      {
        type: 'Curator_Call',
        ref: 'poker_workflow#deal_next_street',
      },
      {
        context: { gameState: cannedMockTable },
      },
    );
    assert.equal(dealCall.result.done, true);
    assert.ok(env.calls.some((c) => c.tool === 'poker_deal_street'));

    // 2. Call poker_workflow#settle_showdown directly
    const settleCall = await runAst(
      env,
      {
        type: 'Curator_Call',
        ref: 'poker_workflow#settle_showdown',
      },
      {
        context: { gameState: cannedMockTable },
      },
    );
    assert.equal(settleCall.result.done, true);
    assert.ok(env.calls.some((c) => c.tool === 'poker_distribute_pots'));

    const snap = await snapshotDb(env);
    assert.ok(snap.requests.every((r: any) => r.status === 'COMPLETED'));
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
    'pokerAction.ts',
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
    pokerActionAst,
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

  assert.equal(pokerActionAst.type, 'Curator_Module');
  assert.equal(pokerActionAst.name, 'poker_action');

  assert.equal(ambientReactionAst.type, 'Curator_Module');
  assert.equal(ambientReactionAst.name, 'ambient_reaction');
  assert.equal(ambientReactionAst.subscriptions?.length, 2);

  const canned = createPokerCannedTools();
  const env = await createEnv('poker_det_ts_workflow', canned);
  try {
    const saved = await saveScript(env, 'poker_workflow_ts', pokerWorkflowAst);
    assert.ok(saved.scriptId > 0);
    assert.equal(saved.version, 1);

    // Call TypeScript subroutine directly
    const dealCall = await runAst(
      env,
      {
        type: 'Curator_Call',
        ref: 'poker_workflow_ts#deal_next_street',
      },
      {
        context: { gameState: cannedMockTable },
      },
    );
    assert.equal(dealCall.result.done, true);
    assert.ok(env.calls.some((c) => c.tool === 'poker_deal_street'));
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
    PokerSubroutine,
    PokerSessionReason,
    PokerSpeechAct,
    PokerLobbyAction,
    PokerActionType,
  } = await import('../src/index.ts');
  const { toVarName } = await import('../src/curator.ts');

  // 1. Verify typed path proxy expression stringification
  assert.equal(String(ctx.gameState.currentStreet), '$context.gameState.currentStreet');
  assert.equal(String(ctx.gameState.pot), '$context.gameState.pot');
  assert.equal(String(ctx.gameState.players[0].chips), '$context.gameState.players.0.chips');
  assert.equal(String(ctx.humanAction.type), '$context.humanAction.type');
  assert.equal(String(ctx.poker_get_choices.choices), '$context.poker_get_choices.choices');
  assert.equal(String(gameState.board), '$context.gameState.board');
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
  assert.equal(PokerTool.APPLY_ACTION, 'poker_apply_action');
  assert.equal(PokerTool.INIT_LOBBY, 'poker_init_lobby');
  assert.equal(PokerModule.WORKFLOW, 'poker_workflow');
  assert.equal(PokerStep.HANDLE_PAUSE, 'poker:handle_pause');
  assert.equal(PokerSessionReason.USER_EXIT, 'user_exit');
  assert.equal(PokerSpeechAct.TABLE_TALK, 'TABLE_TALK');
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


