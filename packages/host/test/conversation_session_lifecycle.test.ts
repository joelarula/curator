import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationRouter,
  ConversationSessionManager,
  FluentGameBuilder,
  game,
  compileCoffeeScriptToAST,
} from '../../../curator/dist/src/index.js';

test('Session vs Conversation: Persistent Container vs Ephemeral Connection Lifecycle', async () => {
  const router = new ConversationRouter({ localNodeId: 'node-alpha', localProjectId: 'proj-1' });
  const manager = router.sessionManager;

  // 1. Starting Persistent Conversation Container
  const room = await manager.startConversation({
    conversationId: 'room_high_stakes_poker',
    conversationType: 'forum',
    topic: 'High Stakes Texas Holdem & Ambient Banter',
    governanceMode: 'moderated',
    requiredVotes: 3,
    ruleset: 'texas_holdem_nl',
    initialState: { pot: 100, currentStreet: 'PRE_FLOP' },
    projectId: 'proj-1',
  });

  assert.equal(room.conversationType, 'forum');
  assert.equal(room.governance?.mode, 'moderated');
  assert.equal(room.roomUri, 'curator://node-alpha/rooms/room_high_stakes_poker');
  assert.equal(room.customState?.ruleset, 'texas_holdem_nl');
  assert.equal(room.quorum?.requiredVotes, 3);

  // 2. Joining Sessions (Handshake, Ephemeral Lease Grant, State Catchup)
  const dealerJoin = await manager.joinConversation('room_high_stakes_poker', {
    nodeId: 'node-alpha',
    agentId: 'dealer_alice',
    conversationalRole: 'dealer',
  }, {
    capabilities: ['deal_cards', 'manage_pot'],
    leaseDurationMs: 60000,
  });

  assert.equal(dealerJoin.session.status, 'connected');
  assert.equal(dealerJoin.session.conversationalRole, 'dealer');
  assert.equal(dealerJoin.session.activeLeases?.length, 2);
  assert.equal(manager.hasCapabilityLease(dealerJoin.session.sessionId, 'deal_cards'), true);
  assert.equal(manager.hasCapabilityLease(dealerJoin.session.sessionId, 'manage_pot'), true);
  assert.equal(dealerJoin.envelope.speechAct, 'JOIN');
  assert.equal(dealerJoin.envelope.topic, 'session:join');

  // Verify State Catchup Snapshot received on join
  assert.equal(dealerJoin.catchup.conversationId, 'room_high_stakes_poker');
  assert.equal(dealerJoin.catchup.turn, 1);
  assert.equal(dealerJoin.catchup.contextState.ruleset, 'texas_holdem_nl');
  assert.equal(dealerJoin.catchup.participants.length, 1);

  // Player Bob joins
  const bobJoin = await manager.joinConversation('room_high_stakes_poker', {
    nodeId: 'node-alpha',
    agentId: 'player_bob',
    conversationalRole: 'player',
  }, {
    capabilities: ['place_bet'],
  });

  assert.equal(bobJoin.session.status, 'connected');
  assert.equal(bobJoin.session.conversationalRole, 'player');

  // Player Charlie joins
  const charlieJoin = await manager.joinConversation('room_high_stakes_poker', {
    nodeId: 'node-alpha',
    agentId: 'player_charlie',
    conversationalRole: 'player',
  });

  // Verify conversation participant roster updated
  const updatedRoom = manager.getConversation('room_high_stakes_poker');
  assert.equal(updatedRoom?.participants.length, 3);
  assert.equal(manager.getSessionsForConversation('room_high_stakes_poker').length, 3);
});

test('Session Presence: Heartbeat refresh and Inactivity Timeout Detection', async () => {
  const router = new ConversationRouter({ localNodeId: 'node-alpha' });
  const manager = router.sessionManager;

  const joinRes = await manager.joinConversation('room_presence_test', {
    nodeId: 'node-alpha',
    agentId: 'agent_presence',
    conversationalRole: 'observer',
  });

  const sessionId = joinRes.session.sessionId;
  const initialHb = joinRes.session.lastHeartbeat;

  // Advance time and send heartbeat
  const hbSuccess = manager.heartbeat(sessionId);
  assert.equal(hbSuccess, true);
  assert.equal(manager.getSession(sessionId)?.status, 'connected');

  // Inactivity timeout test (with threshold 0ms to immediately trigger)
  let timeoutFired = false;
  manager.once('session:timeout', (s) => {
    if (s.sessionId === sessionId) timeoutFired = true;
  });

  const timedOutSessions = manager.checkTimeouts(0);
  assert.equal(timedOutSessions.length, 1);
  assert.equal(timedOutSessions[0].sessionId, sessionId);
  assert.equal(timedOutSessions[0].status, 'timed_out');
  assert.equal(timeoutFired, true);
});

test('Dual-Track Interaction: Spontaneous Ambient Acts (Gossip, Table Talk, Whispers) are Turn-Invariant', async () => {
  const router = new ConversationRouter({ localNodeId: 'node-alpha' });
  const manager = router.sessionManager;

  await manager.startConversation({
    conversationId: 'room_table_talk',
    conversationType: 'forum',
    initialState: { turn: 1, currentPot: 500, gamePhase: 'FLOP' },
  });

  await manager.joinConversation('room_table_talk', {
    nodeId: 'node-alpha',
    agentId: 'player_bob',
    conversationalRole: 'player',
  });

  await manager.joinConversation('room_table_talk', {
    nodeId: 'node-alpha',
    agentId: 'player_charlie',
    conversationalRole: 'player',
  });

  // 1. Spontaneous Table Talk between formal turns
  const tableTalkRes = await manager.processEventIn({
    conversationId: 'room_table_talk',
    speechAct: 'INFORM',
    sender: { nodeId: 'node-alpha', agentId: 'player_bob', conversationalRole: 'player' },
    topic: 'ambient:table_talk',
    payload: {
      action: 'table_talk',
      ambientAct: 'TABLE_TALK',
      utterance: 'Anyone else notice how tight Alice plays when she has pocket pairs?',
      outOfTurn: true,
    },
    contextState: {
      banterCount: 1,
      suspicion_alice: 4,
    },
  });

  assert.equal(tableTalkRes.outboundEnvelopes.length, 1);
  assert.equal(tableTalkRes.outboundEnvelopes[0].payload.ambientAct, 'TABLE_TALK');

  // 2. Gossip about participant or third party
  const gossipRes = await manager.processEventIn({
    conversationId: 'room_table_talk',
    speechAct: 'INFORM',
    sender: { nodeId: 'node-alpha', agentId: 'player_charlie', conversationalRole: 'player' },
    topic: 'ambient:gossip',
    payload: {
      action: 'gossip',
      ambientAct: 'GOSSIP',
      subject: 'dealer_alice',
      utterance: 'Word is she lost her shirt in Macau last month.',
      outOfTurn: true,
    },
    contextState: {
      gossipCount: 1,
      affinity_charlie_bob: 2,
    },
  });

  assert.equal(gossipRes.outboundEnvelopes[0].payload.ambientAct, 'GOSSIP');

  // 3. Bilateral Private Whisper
  const whisperRes = await manager.processEventIn({
    conversationId: 'room_table_talk',
    speechAct: 'INFORM',
    conversationType: 'dialog',
    sender: { nodeId: 'node-alpha', agentId: 'player_bob', conversationalRole: 'player' },
    recipients: [{ nodeId: 'node-alpha', agentId: 'player_charlie', conversationalRole: 'player' }],
    topic: 'whisper:side_channel',
    payload: {
      action: 'whisper',
      ambientAct: 'WHISPER',
      utterance: 'Check it down to the river?',
      outOfTurn: true,
      private: true,
    },
    contextState: {
      whisperCount: 1,
    },
  });

  assert.equal(whisperRes.outboundEnvelopes[0].payload.ambientAct, 'WHISPER');

  // 4. Verify Turn Invariance: Formal turn counter did NOT advance!
  const catchup = manager.createCatchupSnapshot('room_table_talk');
  assert.equal(catchup.turn, 1); // Stays at turn 1!
  assert.equal(catchup.contextState.banterCount, 1);
  assert.equal(catchup.contextState.gossipCount, 1);
  assert.equal(catchup.contextState.whisperCount, 1);
  assert.equal(catchup.contextState.gamePhase, 'FLOP'); // Uncorrupted!
});

test('Session Leave & Concession: Floor Release, Ephemeral Lease Revocation, and Quorum Recalibration', async () => {
  const router = new ConversationRouter({ localNodeId: 'node-alpha' });
  const manager = router.sessionManager;

  await manager.startConversation({
    conversationId: 'room_deliberation_quorum',
    conversationType: 'forum',
    governanceMode: 'quorum',
    requiredVotes: 3,
  });

  const s1 = await manager.joinConversation('room_deliberation_quorum', {
    nodeId: 'node-alpha',
    agentId: 'agent_lead',
    conversationalRole: 'chair',
  }, { capabilities: ['admin_override'] });

  const s2 = await manager.joinConversation('room_deliberation_quorum', {
    nodeId: 'node-alpha',
    agentId: 'agent_voter_1',
    conversationalRole: 'voter',
  });

  const s3 = await manager.joinConversation('room_deliberation_quorum', {
    nodeId: 'node-alpha',
    agentId: 'agent_voter_2',
    conversationalRole: 'voter',
  });

  assert.equal(manager.hasCapabilityLease(s1.session.sessionId, 'admin_override'), true);
  const roomBefore = manager.getConversation('room_deliberation_quorum');
  assert.equal(roomBefore?.quorum?.requiredVotes, 3);
  assert.equal(roomBefore?.participants.length, 3);

  // Agent Lead leaves gracefully
  let floorReleased = false;
  manager.once('floor:released', () => { floorReleased = true; });

  const leaveEnvelope = await manager.leaveConversation('room_deliberation_quorum', 'agent_lead', {
    reason: 'session_timeout',
    graceful: true,
  });

  assert.equal(leaveEnvelope.speechAct, 'LEAVE');
  assert.equal(leaveEnvelope.payload.action, 'leave');
  assert.equal(leaveEnvelope.payload.agentId, 'agent_lead');

  // Verify capability lease is revoked
  assert.equal(manager.hasCapabilityLease(s1.session.sessionId, 'admin_override'), false);

  // Verify participant roster updated and quorum recalibrated
  const roomAfter = manager.getConversation('room_deliberation_quorum');
  assert.equal(roomAfter?.participants.length, 2);
  assert.equal(roomAfter?.quorum?.requiredVotes, 2); // Recalibrated to remaining active participants!
});

test('End-to-End Pipeline: Event In -> State Processing -> Event Out via Router', async () => {
  const router = new ConversationRouter({ localNodeId: 'node-local' });

  // 1. Process 'JOIN' Event In
  const joinResult = await router.processEventIn({
    conversationId: 'room_pipeline_test',
    speechAct: 'JOIN',
    sender: { nodeId: 'node-local', agentId: 'agent_judge', conversationalRole: 'judge' },
    payload: {
      capabilities: ['issue_subpoena', 'declare_verdict'],
      leaseDurationMs: 30000,
    },
  });

  assert.equal(joinResult.outboundEnvelopes.length, 1);
  assert.equal(joinResult.outboundEnvelopes[0].speechAct, 'JOIN');
  assert.equal(joinResult.catchup?.conversationId, 'room_pipeline_test');

  // 2. Process 'SYNC' Event In
  const syncResult = await router.processEventIn({
    conversationId: 'room_pipeline_test',
    speechAct: 'SYNC',
    sender: { nodeId: 'node-local', agentId: 'agent_observer', conversationalRole: 'observer' },
  });

  assert.equal(syncResult.outboundEnvelopes.length, 1);
  assert.equal(syncResult.outboundEnvelopes[0].speechAct, 'SYNC');
  assert.equal(syncResult.catchup?.participants.length, 1);

  // 3. Process 'LEAVE' Event In
  const leaveResult = await router.processEventIn({
    conversationId: 'room_pipeline_test',
    speechAct: 'LEAVE',
    sender: { nodeId: 'node-local', agentId: 'agent_judge', conversationalRole: 'judge' },
    payload: { reason: 'court_adjourned', graceful: true },
  });

  assert.equal(leaveResult.outboundEnvelopes.length, 1);
  assert.equal(leaveResult.outboundEnvelopes[0].speechAct, 'LEAVE');
  assert.equal(leaveResult.outboundEnvelopes[0].payload.reason, 'court_adjourned');
});

test('Fluent Game Builder: Session Verbs (join, table_talk, gossip, whisper, leave) compile to valid Execution AST', () => {
  const g = new FluentGameBuilder('poker:table_alpha');

  g.join({ agentId: 'alice', as_role: 'dealer', capabilities: ['deal'] })
   .join({ agentId: 'bob', as_role: 'player' })
   .table_talk('Nice weather outside the casino')
   .gossip({ subject: 'casino_owner', utterance: 'He is watching from the balcony' })
   .whisper('bob', 'Let us play conservatively')
   .leave({ agentId: 'bob', reason: 'broke', concede: true });

  const ast: any = g.build();
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'poker:table_alpha');
  assert(ast.subAgents.length >= 10);

  // Verify child nodes have the emitEvent nodes with correct speech acts
  const emitNodes = ast.subAgents.filter((n: any) => n.type === 'Curator_EmitEvent' && n.eventName === 'agent:message');
  assert(emitNodes.length >= 6);

  const speechActs = emitNodes.map((n: any) => n.payload?.speechAct || n.args?.payload?.speechAct);
  assert(speechActs.includes('JOIN'));
  assert(speechActs.includes('INFORM'));
  assert(speechActs.includes('LEAVE'));
});

test('CoffeeScript DSL: Session Lifecycle & Real-Time Presence compilation to AST', async () => {
  const coffeeScript = `
game('poker:table_vip')
  .join(agentId: 'alice', as_role: 'dealer', capabilities: ['deal'])
  .join(agentId: 'bob', as_role: 'player')
  .table_talk('Good luck everyone')
  .gossip(subject: 'charlie', utterance: 'He never bluffs')
  .whisper('bob', 'Split the pot?')
  .leave(agentId: 'bob', reason: 'Folded hand', concede: true)
  .leave(agentId: 'alice', reason: 'Shift over')
`;

  const ast: any = await compileCoffeeScriptToAST(coffeeScript);
  assert.equal(ast.type, 'Curator_Sequential');
  assert(ast.subAgents.length > 0);
});

test('Fluent CoffeeScript DSL: Complete Texas Holdem Hand Workflow compilation', async () => {
  const script = `
game('poker:high_roller_lounge')
  .bracket(frame: 'texas_holdem_nl')
  .join(agentId: 'hero', as_role: 'player', name: 'You')
  .join(agentId: 'viper', as_role: 'dealer', name: 'Viper (Shark)', capabilities: ['deal', 'manage_pot'])
  .join(agentId: 'maddog', as_role: 'player', name: 'MadDog (Maniac)')
  .join(agentId: 'barnaby', as_role: 'player', name: 'Barnaby (Station)')
  .wager(action: 'small_blind', amount: 10, as_role: '$context.sbPlayer')
  .wager(action: 'big_blind', amount: 20, as_role: '$context.bbPlayer')
  .deal_private(count: 2, as_role: 'dealer')
  .table_talk('Cards are dealt. Action is on player.')
  .bid(action: 'preflop_wagering')
  .gossip(subject: 'viper', utterance: 'He never limps, watch out.')
  .deal_public(count: 3, as_role: 'dealer', street: 'FLOP')
  .bid(action: 'flop_wagering')
  .deal_public(count: 1, as_role: 'dealer', street: 'TURN')
  .bid(action: 'turn_wagering')
  .deal_public(count: 1, as_role: 'dealer', street: 'RIVER')
  .whisper('viper', 'Careful on that flush board...')
  .bid(action: 'river_wagering')
  .showdown(street: 'RIVER')
  .reveal(cards: 'all_eligible_hands')
  .settlement(rule: 'side_pots_then_main')
  .rotate_dealer()
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'poker:high_roller_lounge');
  assert(ast.subAgents.length >= 20);
});

test('Fluent CoffeeScript DSL: Real-Time Dynamic Event-Driven Poker State Machine Loop', async () => {
  const script = `
seq "poker:dynamic_engine", [
  tool "poker_init_hand", tableId: "poker:high_roller_lounge"
  while_loop "not $context.handOver and $context.currentStreet != 'SHOWDOWN'",
    seq "poker:street_loop", [
      while_loop "not $context.streetComplete and not $context.handOver",
        seq "poker:turn_step", [
          if_else "$context.activePlayer.isHuman",
            seq("poker:human_input", [
              emit_event "poker:awaiting_human_action", player: "$context.activePlayerId"
              wait_event "poker:action", "humanAction"
            ]),
            seq("poker:ai_input", [
              tool "poker_ai_decision", persona: "$context.activePlayer.persona"
            ])
          tool "poker_apply_action", action: "$context.lastAction"
          if_else "$context.activeCount <= 1",
            set_state handOver: true, singleSurvivor: true
        ]
      if_else "not $context.handOver",
        seq "poker:advance_street", [
          tool "poker_slice_side_pots"
          if_else "$context.allInRunout",
            tool("poker_fast_forward_board"),
            tool("poker_deal_street")
        ]
    ]
  if_else "$context.singleSurvivor",
    tool("poker_award_survivor"),
    seq "poker:showdown", [
      tool "eval_poker", hands: "$context.hands", community: "$context.board"
      tool "poker_distribute_pots"
    ]
  rotate_dealer()
]
`;

  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
  assert.equal(ast.name, 'poker:dynamic_engine');
  assert(ast.subAgents.length > 0);
});



