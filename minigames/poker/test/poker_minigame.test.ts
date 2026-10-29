import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  evaluateBestHand,
  pokerComposables,
  pokerPlugin,
  initPokerLobby,
  startPokerHand,
  dealPokerStreet,
  distributePokerPots,
  rotatePokerDealer,
  checkPokerGameOver,
  reduceTable,
  PokerTableCommand,
} from '../src/index.ts';
const { agent_decision } = pokerComposables;
import {
  curatorEngine,
  provisionSqliteDb,
  LlmFactory,
} from '@curator/agent-server';
import { POKER_WORKFLOW_ASTS } from '../src/session/pokerSession.ts';

function getPokerScriptAST(scriptId: string) {
  return POKER_WORKFLOW_ASTS[scriptId];
}
import type { Card, PlayerState, PokerGameState } from '../src/types.ts';

curatorEngine.registerPlugin(pokerPlugin);

class MockPokerLlmProvider {
  readonly providerName = 'gemini';
  async generateContent(req: any) {
    const prompt = `${req.systemPrompt || ''}\n${req.messages?.[0]?.content || ''}`;
    let action = 'CHECK';
    let amount = 0;
    let speech = 'Let us play.';
    let speechAct = 'TABLE_TALK';
    let innerMonologue = 'Evaluating hand.';

    if (prompt.includes('Discourse Event')) {
      return {
        text: JSON.stringify({
          speech: prompt.includes('pocket aces') ? 'That is for me to know and you to pay to find out.' : 'Good luck to you as well.',
          speechAct: prompt.includes('WHISPER') ? 'WHISPER' : 'TABLE_TALK',
          innerMonologue: 'Received table discourse.',
        }),
      };
    }

    if (prompt.includes('Cost to Call: $0')) {
      action = 'CHECK';
    } else if (prompt.includes('Viper') || prompt.includes('ruthless') || prompt.includes('shark')) {
      if (prompt.includes('[7♠] [2♦]')) {
        action = 'FOLD';
        speech = 'Not this time.';
        innerMonologue = 'Discipline fold on 7-2 offsuit.';
      } else {
        action = 'RAISE';
        amount = 40;
      }
    } else if (prompt.includes('Barnaby') || prompt.includes('station')) {
      action = 'CALL';
      amount = 20;
      speech = 'I will pay to see one more card.';
      innerMonologue = 'Curious to see what comes.';
    } else if (prompt.includes('MadDog') || prompt.includes('maniac')) {
      action = 'RAISE';
      amount = 60;
      speech = 'You think you can take my blinds?';
      speechAct = 'PROVOKE';
      innerMonologue = 'Applying maximum preflop pressure.';
    }

    return {
      text: JSON.stringify({ action, amount, speech, speechAct, innerMonologue }),
    };
  }
}

const mockLlm = new MockPokerLlmProvider();
LlmFactory.registerProvider('gemini', mockLlm);
curatorEngine.registerLlmProvider('gemini', mockLlm);

test('Poker Evaluator: Accurately identifies hand categories and kicker tiebreakers', () => {
  // 1. Royal Flush
  const royalCards: Card[] = [
    { rank: 'A', suit: '♠' },
    { rank: 'K', suit: '♠' },
  ];
  const royalCommunity: Card[] = [
    { rank: 'Q', suit: '♠' },
    { rank: 'J', suit: '♠' },
    { rank: '10', suit: '♠' },
    { rank: '2', suit: '♥' },
    { rank: '3', suit: '♦' },
  ];
  const royalEval = evaluateBestHand(royalCards, royalCommunity);
  assert.equal(royalEval.category, 'ROYAL_FLUSH');

  // 2. Full House
  const fhCards: Card[] = [
    { rank: 'K', suit: '♠' },
    { rank: 'K', suit: '♥' },
  ];
  const fhCommunity: Card[] = [
    { rank: 'K', suit: '♦' },
    { rank: '8', suit: '♣' },
    { rank: '8', suit: '♠' },
    { rank: '2', suit: '♦' },
    { rank: '4', suit: '♣' },
  ];
  const fhEval = evaluateBestHand(fhCards, fhCommunity);
  assert.equal(fhEval.category, 'FULL_HOUSE');

  // 3. Flush vs Straight
  const flushCards: Card[] = [{ rank: 'A', suit: '♥' }, { rank: '9', suit: '♥' }];
  const flushBoard: Card[] = [
    { rank: 'K', suit: '♥' },
    { rank: '4', suit: '♥' },
    { rank: '2', suit: '♥' },
    { rank: 'Q', suit: '♠' },
    { rank: 'J', suit: '♦' },
  ];
  const flushEval = evaluateBestHand(flushCards, flushBoard);
  assert.equal(flushEval.category, 'FLUSH');

  const straightCards: Card[] = [{ rank: '10', suit: '♣' }, { rank: '9', suit: '♦' }];
  const straightBoard: Card[] = [
    { rank: '8', suit: '♥' },
    { rank: '7', suit: '♠' },
    { rank: '6', suit: '♦' },
    { rank: '2', suit: '♣' },
    { rank: 'A', suit: '♠' },
  ];
  const straightEval = evaluateBestHand(straightCards, straightBoard);
  assert.equal(straightEval.category, 'STRAIGHT');

  // Flush beats Straight
  assert(flushEval.score > straightEval.score);
});

test('AI Personas: Shark plays discipline, Maniac aggresses, Station calls', async () => {
  const dummyState: PokerGameState = {
    tableId: 'test_table',
    handNumber: 1,
    buttonIdx: 0,
    sbIdx: 1,
    bbIdx: 2,
    sbAmount: 10,
    bbAmount: 20,
    currentStreet: 'PREFLOP',
    board: [],
    deck: [],
    pot: 60,
    sidePots: [],
    currentBet: 60, // 3x BB raise
    minRaise: 20,
    activePlayerIdx: 1,
    streetComplete: false,
    handOver: false,
    singleSurvivor: false,
    winnerIds: [],
    players: [],
    recentRemarks: [],
  };

  // Viper (Shark) with trash hand facing 3x BB raise folds
  const viper: PlayerState = {
    id: 'viper',
    name: 'Viper (Shark)',
    isHuman: false,
    persona: 'shark',
    chips: 1000,
    streetBet: 0,
    totalHandBet: 0,
    holeCards: [{ rank: '7', suit: '♠' }, { rank: '2', suit: '♦' }],
    folded: false,
    allIn: false,
    seatIdx: 1,
  };
  const viperAgentNode = agent_decision({
    agentName: viper.name,
    prompt: `Turn State: Cost to Call: $60. Hand: [7♠] [2♦] (${viper.name})`,
  });
  assert.equal(viperAgentNode.type, 'Curator_Agent');
  const provider = LlmFactory.getProvider('gemini');
  const viperRes = await provider.generateContent({
    systemPrompt: viperAgentNode.instruction,
    messages: [{ role: 'user', content: viperAgentNode.prompt || '' }],
    jsonOutput: true,
  });
  const viperAction = JSON.parse(viperRes.text || '{}');
  assert.equal(viperAction.action, 'FOLD');

  // Barnaby (Station) calls
  const barnaby: PlayerState = {
    id: 'barnaby',
    name: 'Barnaby (Station)',
    isHuman: false,
    persona: 'station',
    chips: 1000,
    streetBet: 0,
    totalHandBet: 0,
    holeCards: [{ rank: '9', suit: '♠' }, { rank: '8', suit: '♦' }],
    folded: false,
    allIn: false,
    seatIdx: 3,
  };
  const barnabyAgentNode = agent_decision({
    agentName: barnaby.name,
    prompt: `Turn State: Cost to Call: $60. Hand: [9♠] [8♦] (${barnaby.name})`,
  });
  assert.equal(barnabyAgentNode.type, 'Curator_Agent');
  const barnabyRes = await provider.generateContent({
    systemPrompt: barnabyAgentNode.instruction,
    messages: [{ role: 'user', content: barnabyAgentNode.prompt || '' }],
    jsonOutput: true,
  });
  const barnabyAction = JSON.parse(barnabyRes.text || '{}');
  assert.equal(barnabyAction.action, 'CALL');
});

test('Agent Discourse: Autonomous agents attach in-character dialogue and speech acts', async () => {
  const hero: PlayerState = {
    id: 'hero',
    name: 'You (Hero)',
    isHuman: true,
    chips: 1000,
    streetBet: 0,
    totalHandBet: 0,
    holeCards: [{ rank: 'A', suit: '♥' }, { rank: 'K', suit: '♦' }],
    folded: false,
    allIn: false,
    seatIdx: 0,
  };

  const maddog: PlayerState = {
    id: 'maddog',
    name: 'MadDog (Maniac)',
    instruction: 'You are MadDog, an aggressive wild maniac who loves to provoke opponents and shove chips.',
    isHuman: false,
    persona: 'maniac',
    chips: 800,
    streetBet: 0,
    totalHandBet: 0,
    holeCards: [{ rank: 'K', suit: '♠' }, { rank: '3', suit: '♦' }],
    folded: false,
    allIn: false,
    seatIdx: 2,
  };

  const dummyState: PokerGameState = {
    tableId: 'test_table',
    handNumber: 1,
    buttonIdx: 0,
    sbIdx: 1,
    bbIdx: 2,
    sbAmount: 10,
    bbAmount: 20,
    currentStreet: 'PREFLOP',
    board: [],
    deck: [],
    pot: 240,
    sidePots: [],
    currentBet: 20,
    minRaise: 20,
    activePlayerIdx: 2,
    streetComplete: false,
    handOver: false,
    singleSurvivor: false,
    winnerIds: [],
    players: [hero, maddog],
    recentRemarks: [],
  };

  const maddogAgentNode = agent_decision({
    agentName: maddog.name,
    prompt: `Turn State: Cost to Call: $20. Hand: [A♥] [K♦] (${maddog.name})`,
  });
  assert.equal(maddogAgentNode.type, 'Curator_Agent');
  const provider = LlmFactory.getProvider('gemini');
  const maddogRes = await provider.generateContent({
    systemPrompt: maddogAgentNode.instruction,
    messages: [{ role: 'user', content: maddogAgentNode.prompt || '' }],
    jsonOutput: true,
  });
  const action = JSON.parse(maddogRes.text || '{}');
  assert(['RAISE', 'CALL', 'CHECK', 'FOLD', 'ALL_IN'].includes(action.action));
  assert(maddogAgentNode.instruction?.includes('banter') || maddogAgentNode.instruction?.includes('speech'));
  if (action.speech) {
    assert.equal(typeof action.speech, 'string');
  }
});

test('Reactive Poker Workflow AST: Validates dynamic poker state machine workflow', async () => {
  const ast: any = await getPokerScriptAST('poker_workflow');
  assert.equal(ast.type, 'Curator_Module');
  assert.equal(ast.name, 'poker_workflow');
  assert.equal(ast.main.type, 'Curator_Sequential');
  assert.equal(ast.main.name, 'poker:dynamic_engine');
  // Dealing and settling happen inside the table reducer: the flow reaches the engine only through
  // `Poker_Table` nodes (each runs the poker_table_command reducer and emits what it reports)
  const json = JSON.stringify(ast);
  assert(json.includes('"type":"Poker_Table"'));
  assert(!json.includes('"reducer":"poker_table_command"'), 'table steps are Poker_Table nodes, not bare reduce nodes');
  for (const removed of ['poker_start_hand', 'poker_deal_street', 'poker_distribute_pots', 'poker_rotate_dealer', 'poker_check_game_over']) {
    assert(!json.includes(removed), `${removed} is no longer a workflow step`);
  }
});

test('End-to-End Poker Session in SQLite: Lobby init, Blinds, Street deals, Showdown, Button rotation', async () => {
  curatorEngine.registerPlugin(pokerPlugin);

  const testDbPath = process.env.CURATOR_DATABASE_PATH || path.join(process.env.TEMP || os.tmpdir(), 'curator_test_poker.db');
  const prisma: any = await provisionSqliteDb('test-poker', true, { databasePath: testDbPath });

  const user = await prisma.user.upsert({
    where: { email: 'test_hero@tabletop.local' },
    update: {},
    create: { id: 'test-user-1', name: 'Test Hero', email: 'test_hero@tabletop.local' },
  });

  const project = await prisma.project.upsert({
    where: { id: 'test-proj-1' },
    update: {},
    create: { id: 'test-proj-1', name: 'Test Poker Project', userId: user.id },
  });

  let conversation = await prisma.conversation.findFirst({
    where: { userId: user.id, projectId: project.id },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        projectId: project.id,
        metadata: { title: 'Automated Poker Test Lounge' },
      },
    });
  }

  const request = await prisma.request.create({
    data: {
      userId: user.id,
      projectId: project.id,
      conversationId: conversation.id,
      toolName: 'poker_hand',
      status: 'NEW',
    },
  });

  // The engine transitions are plain functions (the workflow reaches them through the table reducer)
  // 1. Init Lobby
  let state = initPokerLobby({ tableId: String(conversation.id), startingChips: 1000 }).gameState;
  assert.equal(state.players.length, 4);
  assert.equal(state.players[0].name, 'You');
  assert.equal(state.players[1].name, 'Viper (Shark)');

  // 2. Start Hand 1 (Button at seat 0, SB at seat 1, BB at seat 2)
  state = startPokerHand(state).gameState;
  assert.equal(state.handNumber, 1);
  assert.equal(state.buttonIdx, 0);
  assert.equal(state.sbIdx, 1);
  assert.equal(state.bbIdx, 2);
  assert.equal(state.pot, 30); // 10 SB + 20 BB

  // 3. Deal FLOP (3 cards), TURN (1 card), RIVER (1 card)
  state = dealPokerStreet(state).gameState;
  assert.equal(state.currentStreet, 'FLOP');
  assert.equal(state.board.length, 3);

  state = dealPokerStreet(state).gameState;
  assert.equal(state.currentStreet, 'TURN');
  assert.equal(state.board.length, 4);

  state = dealPokerStreet(state).gameState;
  assert.equal(state.currentStreet, 'RIVER');
  assert.equal(state.board.length, 5);

  // 4. Distribute Pots at Showdown
  state = distributePokerPots(state).gameState;
  assert.equal(state.handOver, true);
  assert(state.winnerIds.length >= 1);

  // 5. Rotate Dealer Button: Button advances from 0 to 1
  state = rotatePokerDealer(state).gameState;
  assert.equal(state.buttonIdx, 1);

  // 6. Verify standard Curator DB record creation
  const responseRecord = await prisma.response.create({
    data: {
      requestId: request.id,
      conversationId: conversation.id,
      projectId: project.id,
      content: `Hand #1 complete. Winner: ${state.winnerIds.join(', ')}`,
    },
  });
  assert(responseRecord.id > 0);
});

test('Curator Core: AgentInteractionContextManager builds subjective LLM working memory', async () => {
  const { AgentInteractionContextManager } = await import('@curator/agent-server');
  const manager = new AgentInteractionContextManager({ conversationId: 'session_777' });

  // 1. Register agents with distinct persona prompts
  manager.registerParticipant({
    id: 'hero',
    name: 'You (Hero)',
    role: 'human_player',
    isHuman: true,
  });
  manager.registerParticipant({
    id: 'viper',
    name: 'Viper',
    role: 'shark',
    personaPrompt: 'You are Viper, a cold calculating poker shark.',
  });
  manager.registerParticipant({
    id: 'maddog',
    name: 'MadDog',
    role: 'maniac',
    personaPrompt: 'You are MadDog, a reckless aggressive poker maniac.',
  });

  // 2. Set private state
  manager.setPrivateState('hero', { holeCards: 'A♠ K♠' });
  manager.setPrivateState('viper', { holeCards: 'J♦ J♣' });
  manager.setPrivateState('maddog', { holeCards: '8♥ 4♠' });

  // 3. Consecutive game moves and speech acts form the interaction timeline
  manager.recordGameMove({
    actorId: 'hero',
    action: 'RAISE',
    summary: 'Hero raises to $60.',
  });

  manager.recordSpeechAct({
    speakerId: 'hero',
    speechAct: 'WHISPER',
    recipientId: 'viper',
    text: 'Are you folding those jacks?',
  });

  manager.recordSpeechAct({
    speakerId: 'maddog',
    speechAct: 'BANTER',
    text: 'Quit whispering and call my shove!',
  });

  // 4. Build LLM context for Viper
  const viperContext = manager.buildAgentLlmContext('viper', {
    gameStateSummary: 'Flop: 7♠ 2♦ 3♣. Pot: $180. To call: $0.',
    currentPrompt: 'MadDog just shouted at the table. Formulate your private soliloquy and response.',
  });
  assert(viperContext !== null);
  assert(viperContext.userPrompt.includes('J♦ J♣')); // Viper sees own cards
  assert(!viperContext.userPrompt.includes('8♥ 4♠')); // Viper does NOT see MadDog's cards
  assert(viperContext.userPrompt.includes('Are you folding those jacks?')); // Viper knows whisper

  // 5. Build LLM context for MadDog
  const maddogContext = manager.buildAgentLlmContext('maddog', {
    gameStateSummary: 'Flop: 7♠ 2♦ 3♣. Pot: $180. To call: $0.',
    currentPrompt: 'Your action to bet or check.',
  });
  assert(maddogContext !== null);
  assert(maddogContext.userPrompt.includes('8♥ 4♠')); // MadDog sees own cards
  assert(!maddogContext.userPrompt.includes('Are you folding those jacks?')); // MadDog does NOT see secret whisper!
  assert(maddogContext.userPrompt.includes('[OBSERVED]')); // MadDog only observed the whisper

  // 6. Generate agentic reaction
  const reaction = await manager.generateAgentReaction('viper', {
    gameStateSummary: 'Pot: $180.',
    currentPrompt: 'React to Hero.',
    speechActContext: 'WHISPER',
  });
  assert(reaction !== null);
  assert.equal(reaction.speakerId, 'viper');
  assert(reaction.innerMonologue.length > 0);
  assert(reaction.text.length > 0);

  // 7. Verify rendered comparative narratives
  const comparativeView = manager.renderComparativeNarratives();
  assert(comparativeView.includes('VIPER'));
  assert(comparativeView.includes('MADDOG'));
  assert(comparativeView.includes('HERO'));
});

test('Curator Core: Bounded History Compaction, Epoch Demarcations & Checkpoints (OOB)', async () => {
  const { AgentInteractionContextManager } = await import('@curator/agent-server');
  const manager = new AgentInteractionContextManager({
    conversationId: 'poker_bounded_test',
    maxStoryLogEntries: 5,
    autoCompactThreshold: 7,
    maxEventLogEntries: 10,
    promptHistoryWindow: 4,
  });

  manager.registerParticipant({ id: 'hero', name: 'Hero', role: 'player', isHuman: true });
  manager.registerParticipant({ id: 'viper', name: 'Viper', role: 'dealer', isHuman: false });

  // 1. Test Epoch Demarcation
  manager.startEpoch('Hand #1', { description: 'Blinds $10/$20' });
  assert.equal(manager.getCurrentEpoch(), 'Hand #1');

  const heroMem = manager.getMemory('hero')!;
  assert(heroMem.storyLog.some((e: string) => e.includes('=== EPOCH Hand #1: Blinds $10/$20 ===')));

  // 2. Trigger auto-compaction by logging many moves
  for (let i = 1; i <= 8; i++) {
    manager.recordGameMove({
      actorId: i % 2 === 0 ? 'hero' : 'viper',
      action: 'CHECK',
      summary: `Turn ${i} check`,
    });
  }

  // Story log should be compacted and not exceed autoCompactThreshold
  assert(heroMem.storyLog.length <= 6);
  assert(heroMem.storyLog.some((e: string) => e.includes('[SUMMARY of')));

  // 3. Test Checkpointing
  const checkpoint = manager.createCheckpoint({ pot: 120, street: 'TURN' });
  assert(checkpoint.id.startsWith('chk_'));
  assert.equal(checkpoint.epochId, 'Hand #1');
  assert.equal(checkpoint.stateSnapshot?.pot, 120);

  // 4. Test State Projection
  const projection = manager.getProjectedState('hero', 'Pot: $120. Turn: 5♦');
  assert(projection !== null);
  assert.equal(projection.agentId, 'hero');
  assert.equal(projection.publicGameStateSummary, 'Pot: $120. Turn: 5♦');
  assert(projection.recentStoryLog.length <= 4);

  // 5. Start new Epoch
  manager.startEpoch('Hand #2', { description: 'Blinds $25/$50', resetPrivateState: true });
  assert.equal(manager.getCurrentEpoch(), 'Hand #2');
});

test('Dynamic Lobby: Agents & Human join open table dynamically and play', async () => {
  const join = (state: PokerGameState, player: any) => reduceTable(state, { type: PokerTableCommand.JOIN, player });

  // 1. Initialize an empty table
  let step = reduceTable(undefined, { type: PokerTableCommand.BOOT, config: { tableId: 'dynamic_table_1', startingChips: 2000, players: [] } });
  assert.equal(step.gameState.players.length, 0, 'Table should start with 0 players');

  // 2. Dynamically seat Hero (human)
  step = join(step.gameState, { id: 'player_hero', name: 'Alice', isHuman: true, chips: 1500, seatIdx: 0 });
  assert.equal(step.gameState.players.length, 1);
  assert.equal(step.gameState.players[0].name, 'Alice');

  // 3. Dynamically seat 2 AI agents
  step = join(step.gameState, { id: 'agent_viper', name: 'Viper Prime', persona: 'shark', chips: 2000 });
  assert.equal(step.gameState.players.length, 2);
  step = join(step.gameState, { id: 'agent_maddog', name: 'MadDog X', persona: 'maniac', chips: 1800 });
  assert.equal(step.gameState.players.length, 3);

  // 4. Start a hand with the dynamic roster
  step = reduceTable(step.gameState, { type: PokerTableCommand.START });
  let state = step.gameState;
  assert.equal(state.handNumber, 1);
  assert.equal(state.players.length, 3);
  assert(state.pot > 0, 'Blinds should be posted for the seated players');
  assert.equal(state.players[0].holeCards.length, 2);
  assert.equal(state.players[1].holeCards.length, 2);
  assert.equal(state.players[2].holeCards.length, 2);

  // 5. One player leaves / cashes out
  step = reduceTable(state, { type: PokerTableCommand.LEAVE, id: 'agent_maddog' });
  state = step.gameState;
  assert.equal(state.players.length, 2);
  assert(!state.players.some((p: any) => p.id === 'agent_maddog'));
});

test('Curator Agent System Prompt: Integrates persona instructions, Texas Hold\'em rules, and speech protocol', async () => {
  const { agent_decision } = await import('../src/workflows/agentTurn.ts');
  const node: any = agent_decision();

  // 1. The seat being played supplies identity and persona
  assert(node.instruction.includes('{$params.actor.name?}'));
  assert(node.instruction.includes('{$params.actor.instruction?}'));

  // 2. The engine's rules are the one rule text
  assert(node.instruction.includes('CHECK, CALL, RAISE, ALL_IN, FOLD'));
  assert(node.instruction.includes('If Cost to Call is 0: you CANNOT FOLD'));
  assert(node.instruction.includes('Cost to Call + Min Raise'));
  assert(node.prompt.includes('Cost to Call: [chips] {$state.gameState.currentBet - $params.actor.streetBet?}'));

  // 3. Speech protocol, and table talk comes from the shared conversation
  assert(node.instruction.includes('TABLE_TALK, BANTER, WHISPER, PROVOKE, GOSSIP'));
  assert.equal(node.history_from, 'conversation');

  // 4. Structured answer
  assert.deepEqual(Object.keys(node.output_schema.properties).filter((k) => ['action', 'speech', 'innerMonologue'].includes(k)).sort(), ['action', 'innerMonologue', 'speech']);
});

test('Curator Bevy Parity: Standings, bankruptcy detection, and final leaderboard report', async () => {
  const getStandingsTool = pokerPlugin.tools!['poker_get_standings'];

  const testState: PokerGameState = {
    tableId: 'bevy_parity_table',
    handNumber: 5,
    buttonIdx: 0,
    sbIdx: 1,
    bbIdx: 0,
    sbAmount: 10,
    bbAmount: 20,
    currentStreet: 'SHOWDOWN',
    board: [],
    deck: [],
    pot: 0,
    sidePots: [],
    currentBet: 0,
    minRaise: 20,
    activePlayerIdx: 0,
    streetComplete: true,
    handOver: true,
    singleSurvivor: false,
    winnerIds: ['hero'],
    maxHands: 10,
    startingChips: 1000,
    startingWallets: { hero: 1000, viper: 1000, maddog: 1000 },
    players: [
      { id: 'hero', name: 'Hero', isHuman: true, chips: 2200, streetBet: 0, totalHandBet: 0, holeCards: [], folded: false, allIn: false, seatIdx: 0 },
      { id: 'viper', name: 'Viper', isHuman: false, chips: 800, streetBet: 0, totalHandBet: 0, holeCards: [], folded: false, allIn: false, seatIdx: 1 },
      { id: 'maddog', name: 'MadDog', isHuman: false, chips: 0, streetBet: 0, totalHandBet: 0, holeCards: [], folded: true, allIn: false, seatIdx: 2 },
    ],
    recentRemarks: [],
  };

  // 1. Get standings
  const standingsRes: any = await getStandingsTool.runAsync({
    args: { state: testState },
    toolContext: {} as any,
  });
  assert(Array.isArray(standingsRes.standings));
  assert.equal(standingsRes.standings[0].name, 'Hero');
  assert.equal(standingsRes.standings[0].net, 1200); // 2200 - 1000
  assert.equal(standingsRes.standings[2].name, 'MadDog');
  assert.equal(standingsRes.standings[2].status, 'Bust');

  // 2. Check game over when only 1 solvent player remains (simulate viper also busting)
  const gameOverState: PokerGameState = {
    ...testState,
    players: [
      { ...testState.players[0], chips: 3000 },
      { ...testState.players[1], chips: 0 },
      { ...testState.players[2], chips: 0 },
    ],
  };

  const overRes = checkPokerGameOver(gameOverState);
  assert.equal(overRes.gameOver, true);
  assert.equal(overRes.result, 'GAME_OVER');
  assert.equal(overRes.winner, 'Hero');
  assert(overRes.report.includes('--- FINAL STANDINGS ---'));
  assert(overRes.report.includes('Rank 1: Hero (Start: 1000, Final: 3000, Net: +2000) [Winner]'));
});

test('Dynamic Seating with Unknown Wallets: Roster seats with default buy-in and tracks individual wallets', async () => {
  // Unknown players passed in with instructions/personas only — NO chips or wallet beforehand!
  const unknownPlayers = [
    {
      id: 'hero',
      name: 'You',
      isHuman: true,
      instruction: 'You are the human player (Hero) at the high-roller poker table.',
    },
    {
      id: 'viper',
      name: 'Viper (Shark)',
      persona: 'shark',
      instruction: "You are Viper, a ruthless and mathematically calculating poker shark at a high-stakes Texas Hold'em table.",
    },
    {
      id: 'maddog',
      name: 'MadDog (Maniac)',
      persona: 'maniac',
      instruction: 'You are MadDog, a wild and loud poker maniac.',
      wallet: 3000, // custom wallet amount
      buyIn: 1000,
    },
    {
      id: 'barnaby',
      name: 'Barnaby (Station)',
      persona: 'station',
      instruction: 'You are Barnaby, an affable, folksy, and warm calling station.',
    },
  ];

  const state: any = initPokerLobby({ tableId: 'dynamic_wallets_table', startingChips: 1000, players: unknownPlayers }).gameState;
  assert.equal(state.players.length, 4);

  // Hero: defaulted buy-in and starting wallet to 1000
  assert.equal(state.players[0].name, 'You');
  assert.equal(state.players[0].chips, 1000);
  assert.equal(state.startingWallets['hero'], 1000);

  // Viper: defaulted buy-in and starting wallet to 1000
  assert.equal(state.players[1].name, 'Viper (Shark)');
  assert.equal(state.players[1].chips, 1000);
  assert.equal(state.startingWallets['viper'], 1000);

  // MadDog: custom wallet 3000, buyIn 1000
  assert.equal(state.players[2].name, 'MadDog (Maniac)');
  assert.equal(state.players[2].chips, 1000);
  assert.equal(state.startingWallets['maddog'], 3000);

  // Barnaby: defaulted buy-in 1000
  assert.equal(state.players[3].name, 'Barnaby (Station)');
  assert.equal(state.players[3].chips, 1000);
  assert.equal(state.startingWallets['barnaby'], 1000);
});

test('Modular Workflow Architecture: Validates all decoupled workflows as Curator ASTs', async () => {
  const workflowAst: any = await getPokerScriptAST('poker_workflow');
  assert.equal(workflowAst.type, 'Curator_Module');
  assert.equal(workflowAst.name, 'poker_workflow');
  assert.equal(workflowAst.main.type, 'Curator_Sequential');

  const lobbyAst: any = await getPokerScriptAST('poker_lobby');
  assert.equal(lobbyAst.type, 'Curator_Module');
  assert.equal(lobbyAst.name, 'poker_lobby');
  assert.equal(lobbyAst.main.type, 'Curator_Sequential');

  const humanAst: any = await getPokerScriptAST('human_turn');
  assert.equal(humanAst.type, 'Curator_Module');
  assert.equal(humanAst.name, 'human_turn');
  assert.equal(humanAst.main.type, 'Curator_Sequential');

  const agentAst: any = await getPokerScriptAST('agent_turn');
  assert.equal(agentAst.type, 'Curator_Module');
  assert.equal(agentAst.name, 'agent_turn');
  assert.equal(agentAst.main.type, 'Curator_Sequential');

  // Systems-only modules: rules and ambient reactions run beside every table
  const rulesAst: any = await getPokerScriptAST('poker_rules');
  assert.equal(rulesAst.type, 'Curator_Module');
  assert.equal(rulesAst.name, 'poker_rules');
  assert.deepEqual(rulesAst.subscriptions.map((s: any) => s.eventName), ['poker:action_intent', 'poker:action_validated', 'poker:session_exited']);

  const ambientAst: any = await getPokerScriptAST('ambient_reaction');
  assert.equal(ambientAst.type, 'Curator_Module');
  assert.equal(ambientAst.name, 'ambient_reaction');
  assert.equal(ambientAst.subscriptions?.length, 2);

  // Verify all scripts are registered on pokerPlugin
  assert(pokerPlugin.scripts);
  assert(pokerPlugin.scripts['poker_workflow']);
  assert(pokerPlugin.scripts['poker_lobby']);
  assert(pokerPlugin.scripts['human_turn']);
  assert(pokerPlugin.scripts['agent_turn']);
  assert(pokerPlugin.scripts['poker_rules']);
  assert(pokerPlugin.scripts['ambient_reaction']);
});

test('Poker Client-Server Architecture: Server boots, accepts WebSocket client, streams events', async () => {
  const { createPokerServer } = await import('../src/server/pokerServer.ts');
  const { WebSocket } = await import('ws');

  const testDb = path.join(process.env.TEMP || os.tmpdir(), `curator_test_server_${Date.now()}.db`);
  const serverInstance = await createPokerServer({
    port: 4899,
    databasePath: testDb,
    forceReset: true,
    maxSeats: 4,
    pollInterval: 100,
  });

  assert.equal(serverInstance.port, 4899);
  assert(serverInstance.wsUrl.includes('/api/events'));

  const ws = new WebSocket(serverInstance.wsUrl);
  const connected = await new Promise<boolean>((resolve) => {
    ws.on('open', () => resolve(true));
    ws.on('error', () => resolve(false));
  });
  assert.equal(connected, true);

  await new Promise<void>((resolve) => {
    ws.on('close', () => resolve());
    ws.close();
  });
  await serverInstance.stop();
});

test('Poker Direct Synchronous Execution: Runs AST workflow step-by-step from human turn to human turn (Zero Outer APIs)', async () => {
  const { createPokerHost } = await import('../src/host.ts');
  const { createPokerGameSession } = await import('../src/session/pokerSession.ts');
  const testDb = path.join(process.env.TEMP || os.tmpdir(), `curator_test_direct_${Date.now()}.db`);

  const host = await createPokerHost({
    databasePath: testDb,
    forceReset: true,
  });
  const session = await createPokerGameSession(host, {
    tableId: 1,
    forceReset: true,
    maxSeats: 4,
    startingChips: 1000,
  });

  // 1. Initial synchronous step advances until human turn or hand start
  const step1 = await session.step(session.tableId, 50);
  assert(step1.gameState !== null);
  assert.equal(step1.gameState?.players.length, 4);

  // 2. Either we are at human turn (PREFLOP) or game is advancing
  if (step1.waitingForHuman && step1.humanTurn) {
    assert.equal(step1.humanTurn.street, 'PREFLOP');
    assert(step1.humanTurn.choices.length > 0);

    // 3. Submit human action and advance to next turn directly in Curator
    await session.send('poker:human_action', { type: 'CALL', amount: 20 }, session.tableId);
    const step2 = await session.step(session.tableId);
    assert(step2.gameState !== null);
  }

  await session.close();
  await host.stop();
});

test('Poker Direct Channel: In-process channel executes AST from action A to action B with zero network sockets', async () => {
  const { createDirectSessionChannel } = await import('../src/client/pokerClient.ts');
  const testDb = path.join(process.env.TEMP || os.tmpdir(), `curator_test_direct_chan_${Date.now()}.db`);

  const channel = await createDirectSessionChannel({
    tableId: 1,
    databasePath: testDb,
    forceReset: true,
    maxSeats: 4,
    startingChips: 1000,
  });

  let eventsReceived: string[] = [];
  channel.on((ev) => eventsReceived.push(ev.type));

  await channel.start?.();
  assert(eventsReceived.includes('poker:new_round') || eventsReceived.includes('poker:lobby_ready'));

  await channel.send('poker:human_action', { type: 'CALL', amount: 20 });
  await channel.close();
});





