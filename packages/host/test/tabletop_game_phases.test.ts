import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CuratorEngine,
  tabletopPlugin,
  evalBlackjackTool,
  evalPokerTool,
  evalTrickTool,
  compileCoffeeScriptToAST,
  UNIVERSAL_GAME_PHASE_MATRIX,
  getPhaseDefinition,
  isValidPhaseTransition,
  game,
  table,
} from '../../../curator/dist/src/index.js';

test('Universal Game Phase Matrix: Formal 5-phase definitions and agency properties', () => {
  // Phase 1: Initialization
  const p1 = UNIVERSAL_GAME_PHASE_MATRIX.INITIALIZATION;
  assert.equal(p1.phaseNumber, 1);
  assert.equal(p1.fundamentalQuestion, 'Who is in, and at what cost?');
  assert.equal(p1.playerAgency, 'contractual');
  assert.equal(p1.playerAgencyLabel, 'Binary / Contractual');
  assert.ok(p1.typicalCommunicativeTurns.some(t => t.includes('Commit stake')));

  // Phase 2: Allocation
  const p2 = UNIVERSAL_GAME_PHASE_MATRIX.ALLOCATION;
  assert.equal(p2.phaseNumber, 2);
  assert.equal(p2.fundamentalQuestion, 'What hand did fate deal?');
  assert.equal(p2.playerAgency, 'passive_reception');
  assert.equal(p2.playerAgencyLabel, 'Passive reception');

  // Phase 3: Interaction
  const p3 = UNIVERSAL_GAME_PHASE_MATRIX.INTERACTION;
  assert.equal(p3.phaseNumber, 3);
  assert.equal(p3.fundamentalQuestion, 'How do I leverage, bluff, or optimize?');
  assert.equal(p3.playerAgency, 'strategic_choice');
  assert.equal(p3.playerAgencyLabel, 'High strategic choice');

  // Phase 4: Verification
  const p4 = UNIVERSAL_GAME_PHASE_MATRIX.VERIFICATION;
  assert.equal(p4.phaseNumber, 4);
  assert.equal(p4.fundamentalQuestion, 'Whose assertion was valid?');
  assert.equal(p4.playerAgency, 'revealing_truth');
  assert.equal(p4.playerAgencyLabel, 'Revealing truth');

  // Phase 5: Settlement
  const p5 = UNIVERSAL_GAME_PHASE_MATRIX.SETTLEMENT;
  assert.equal(p5.phaseNumber, 5);
  assert.equal(p5.fundamentalQuestion, 'Who owns the consequences?');
  assert.equal(p5.playerAgency, 'passive_accounting');
  assert.equal(p5.playerAgencyLabel, 'Passive accounting');

  // Phase Transition Validation
  assert.equal(isValidPhaseTransition('INITIALIZATION', 'ALLOCATION'), true);
  assert.equal(isValidPhaseTransition('ALLOCATION', 'INTERACTION'), true);
  assert.equal(isValidPhaseTransition('INTERACTION', 'VERIFICATION'), true);
  assert.equal(isValidPhaseTransition('VERIFICATION', 'SETTLEMENT'), true);
  assert.equal(isValidPhaseTransition('SETTLEMENT', 'INITIALIZATION'), true);
  assert.equal(isValidPhaseTransition('INITIALIZATION', 'VERIFICATION'), false); // Illegal leap
});

test('Tabletop Plugin: CuratorEngine registers tabletop tools and vocabulary verbs', () => {
  const engine = new CuratorEngine();
  engine.registerPlugin(tabletopPlugin);

  assert.ok(engine.tools.has('eval_blackjack'));
  assert.ok(engine.tools.has('eval_poker'));
  assert.ok(engine.tools.has('eval_trick'));
  assert.equal(engine.plugins.length, 1);
  assert.equal(engine.plugins[0].name, 'tabletop');
});

test('Tabletop Plugin: Deterministic Rule Evaluators', async () => {
  // 1. Blackjack Evaluator
  const bjStand = await evalBlackjackTool.runAsync({
    args: { cards: [{ rank: '10' }, { rank: '7' }] },
    toolContext: {},
  }) as any;
  assert.equal(bjStand.total, 17);
  assert.equal(bjStand.isBust, false);

  const bjBust = await evalBlackjackTool.runAsync({
    args: { cards: [{ rank: 'K' }, { rank: '8' }, { rank: '5' }] },
    toolContext: {},
  }) as any;
  assert.equal(bjBust.total, 23);
  assert.equal(bjBust.isBust, true);

  const bjAce = await evalBlackjackTool.runAsync({
    args: { cards: [{ rank: 'A' }, { rank: 'K' }] },
    toolContext: {},
  }) as any;
  assert.equal(bjAce.total, 21);
  assert.equal(bjAce.isBlackjack, true);

  // 2. Poker Evaluator
  const pokerRes = await evalPokerTool.runAsync({
    args: {
      hands: {
        alice: [{ rank: 'A' }, { rank: 'A' }, { rank: 'A' }], // three of a kind
        bob: [{ rank: 'K' }, { rank: 'K' }],                  // pair
      },
      community: [],
    },
    toolContext: {},
  }) as any;
  assert.equal(pokerRes.winner, 'alice');
  assert.equal(pokerRes.rankings.alice.category, 'three_of_a_kind');
  assert.equal(pokerRes.rankings.bob.category, 'pair');

  // 3. Trick Evaluator (Trump vs Lead)
  const trickRes = await evalTrickTool.runAsync({
    args: {
      leadSuit: 'hearts',
      trumpSuit: 'spades',
      plays: [
        { player: 'north', suit: 'hearts', rank: 'K' },
        { player: 'east', suit: 'spades', rank: '2' }, // Trumps King of Hearts
        { player: 'south', suit: 'hearts', rank: '10' },
      ],
    },
    toolContext: {},
  }) as any;
  assert.equal(trickRes.winner, 'east');
  assert.equal(trickRes.isTrumped, true);
});

test('Universal 5 Phases: Blackjack Workflow compiles to valid Execution AST', async () => {
  const script = `
game('blackjack_table')
  .ante(amount: 25)
  .deal_private(to_role: 'player', count: 2)
  .deal_public(count: 1)
  .hit(as_role: 'player')
  .stand(as_role: 'player')
  .showdown(evaluator: 'eval_blackjack')
  .settlement(winner: 'player', pot: 50)
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'game:blackjack_table');

  // Verify Phase 1 (ANTE)
  const anteState = ast.subAgents[0];
  assert.equal(anteState.type, 'Curator_SetState');
  assert.equal(anteState.state.gamePhase, 'ANTE');
  assert.equal(anteState.state.pot, 25);

  const anteEmit = ast.subAgents[1];
  assert.equal(anteEmit.type, 'Curator_EmitEvent');
  assert.equal(anteEmit.payload.speechAct, 'REQUEST');

  // Verify Phase 2 (DEAL Private & Public)
  const dealPrivEmit = ast.subAgents[3];
  assert.equal(dealPrivEmit.payload.conversationType, 'dialog');
  assert.equal(dealPrivEmit.payload.targetRole, 'player');

  const dealPubEmit = ast.subAgents[5];
  assert.equal(dealPubEmit.payload.conversationType, 'forum');

  // Verify Phase 3 (HIT / STAND)
  const hitEmit = ast.subAgents[7];
  assert.equal(hitEmit.payload.speechAct, 'REQUEST');
  assert.equal(hitEmit.payload.topic, 'resource:hit');

  const standEmit = ast.subAgents[9];
  assert.equal(standEmit.payload.speechAct, 'ACCEPT');
  assert.equal(standEmit.payload.topic, 'contestation:stand');

  // Verify Phase 4 (SHOWDOWN)
  const showdownState = ast.subAgents[10];
  assert.equal(showdownState.state.gamePhase, 'SHOWDOWN');
  const showdownEmit = ast.subAgents[11];
  assert.equal(showdownEmit.payload.speechAct, 'SYNTHESIZE');

  // Verify Phase 5 (SETTLEMENT)
  const settleState = ast.subAgents[12];
  assert.equal(settleState.state.gamePhase, 'SETTLEMENT');
  assert.equal(settleState.state.roundStatus, 'CONCLUDED');
});

test('Universal 5 Phases: Texas Holdem Multi-Street Wager & Blinds', async () => {
  const script = `
seq 'holdem_hand',
  ante table: 'poker_table', blinds: { sb: 5, bb: 10 }
  deal_private table: 'poker_table', to_role: 'sb', count: 2
  deal_private table: 'poker_table', to_role: 'bb', count: 2
  wager table: 'poker_table', as_role: 'sb', action: 'raise', amount: 30
  call table: 'poker_table', as_role: 'bb'
  deal_public table: 'poker_table', count: 3, cards: ['Kh', '7d', '2c']
  showdown table: 'poker_table', evaluator: 'eval_poker'
  settlement table: 'poker_table', winner: 'sb', rotateDealer: true
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'holdem_hand');

  // Verify Wager step (PROPOSE)
  const wagerSeq = ast.subAgents[3];
  const wagerEmit = wagerSeq.subAgents[1];
  assert.equal(wagerEmit.payload.speechAct, 'PROPOSE');
  assert.equal(wagerEmit.payload.topic, 'wager:raise');

  // Verify Call step (ACCEPT)
  const callSeq = ast.subAgents[4];
  const callEmit = callSeq.subAgents[1];
  assert.equal(callEmit.payload.speechAct, 'ACCEPT');

  // Verify Showdown (SYNTHESIZE)
  const showdownSeq = ast.subAgents[6];
  const showdownEmit = showdownSeq.subAgents[1];
  assert.equal(showdownEmit.payload.speechAct, 'SYNTHESIZE');
});

test('Universal 5 Phases: Cheat / Bullshit Bluffing & Empirical Contestation', async () => {
  const script = `
seq 'cheat_hand',
  claim table: 'cheat_table', as_role: 'alice', declaration: 'three_aces', rank: 'A', count: 3
  challenge table: 'cheat_table', as_role: 'bob', target_role: 'alice'
  reveal table: 'cheat_table', as_role: 'alice', cards: ['A', 'A', 'K'] # Bluff caught!
  settlement table: 'cheat_table', winner: 'bob'
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'cheat_hand');

  // Claim is an assertive speech act
  const claimSeq = ast.subAgents[0];
  const claimEmit = claimSeq.subAgents[1];
  assert.equal(claimEmit.payload.speechAct, 'ASSERT');
  assert.equal(claimEmit.payload.topic, 'game:claim');

  // Challenge is an audit/vote speech act ("Bullshit!")
  const challengeSeq = ast.subAgents[1];
  const challengeEmit = challengeSeq.subAgents[1];
  assert.equal(challengeEmit.payload.speechAct, 'VOTE');
  assert.equal(challengeEmit.payload.topic, 'contestation:challenge');

  // Reveal tables cards to truth
  const revealSeq = ast.subAgents[2];
  const revealEmit = revealSeq.subAgents[0];
  assert.equal(revealEmit.payload.speechAct, 'INFORM');
  assert.equal(revealEmit.payload.topic, 'game:reveal');
});

test('Universal 5 Phases: Spades Contract Bidding, Lead & Trick Capture', async () => {
  const script = `
seq 'spades_round',
  bid table: 'spades_table', as_role: 'north', suit: 'spades', tricks: 4
  bid table: 'spades_table', as_role: 'east', suit: 'spades', tricks: 3
  lead table: 'spades_table', as_role: 'north', suit: 'hearts', rank: 'K'
  play_card table: 'spades_table', as_role: 'east', suit: 'spades', rank: '2'
  capture table: 'spades_table', winner_role: 'east', points: 1
  settlement table: 'spades_table', winner: 'east_team', rotateDealer: true
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');

  // Contract Bidding is a proposal
  const bidSeq = ast.subAgents[0];
  assert.equal(bidSeq.subAgents[1].payload.speechAct, 'PROPOSE');
  assert.equal(bidSeq.subAgents[1].payload.topic, 'game:bid');

  // Trick Lead & Follow
  const leadSeq = ast.subAgents[2];
  assert.equal(leadSeq.subAgents[1].payload.topic, 'trick:play');
  assert.equal(leadSeq.subAgents[1].payload.payload.action, 'lead');

  // Capture trick
  const captureSeq = ast.subAgents[4];
  assert.equal(captureSeq.subAgents[1].payload.topic, 'trick:capture');
  assert.equal(captureSeq.subAgents[1].payload.payload.winner_role, 'east');
});
