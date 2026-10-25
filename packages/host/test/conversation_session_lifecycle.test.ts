import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConversationRouter,
  ConversationSessionManager,
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



