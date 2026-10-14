import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DialogSession,
  ForumRoom,
  BroadcastChannel,
  QADispatcher,
  ConversationRouter,
  createAgentMessageEnvelope,
} from '../../../curator/dist/src/index.js';

test('Single-Node: DialogSession manages 1:1 stateful bilateral agent dialogue', async () => {
  const initiator = { nodeId: 'local', agentId: 'architect', role: 'designer' };
  const responder = { nodeId: 'local', agentId: 'coder', role: 'developer' };

  const dialog = new DialogSession({
    conversationId: 'dlg_local_auth_refactor',
    initiator,
    responder,
    topic: 'auth-refactor',
  });

  assert.equal(dialog.status, 'ACTIVE');
  assert.equal(dialog.currentTurn, 0);
  assert.equal(dialog.activeSpeaker.agentId, 'architect');

  // Turn 1: Architect initiates with REQUEST
  const env1 = await dialog.sendTurn(initiator, {
    speechAct: 'REQUEST',
    payload: { task: 'refactor_token_expiry', maxAgeSec: 3600 },
    contextState: { phase: 'planning' },
  });

  assert.equal(env1.turn, 1);
  assert.equal(dialog.currentTurn, 1);
  assert.equal(dialog.activeSpeaker.agentId, 'coder');
  assert.equal(dialog.context.phase, 'planning');

  // Turn violation check: Architect cannot speak when Coder holds the turn token
  await assert.rejects(
    async () => {
      await dialog.sendTurn(initiator, {
        speechAct: 'INFORM',
        payload: { nudge: 'are you done?' },
      });
    },
    /Turn order violation/
  );

  // Turn 2: Coder replies with PROPOSE
  const env2 = await dialog.sendTurn(responder, {
    speechAct: 'PROPOSE',
    payload: { patch: 'diff --git a/auth.ts b/auth.ts', expires: 3600 },
    contextState: { diffSize: 42 },
  });

  assert.equal(env2.turn, 2);
  assert.equal(dialog.currentTurn, 2);
  assert.equal(dialog.activeSpeaker.agentId, 'architect');
  assert.equal(dialog.context.diffSize, 42);

  // Turn 3: Architect replies with ACCEPT, completing the dialogue
  const env3 = await dialog.sendTurn(initiator, {
    speechAct: 'ACCEPT',
    payload: { comment: 'Looks solid, approved' },
  });

  assert.equal(env3.turn, 3);
  assert.equal(dialog.status, 'COMPLETED');
  assert.equal(dialog.messageHistory.length, 3);
});

test('Single-Node: ForumRoom manages M:N deliberation, voting quorum, and synthesis', async () => {
  const chair = { nodeId: 'local', agentId: 'lead_architect', role: 'chair' };
  const proposer = { nodeId: 'local', agentId: 'backend_dev', role: 'proposer' };
  const critic = { nodeId: 'local', agentId: 'qa_reviewer', role: 'critic' };

  const forum = new ForumRoom({
    roomUri: 'curator://local/forums/sqlite-migration',
    topic: 'SQLite WASM Migration',
    requiredVotes: 2,
    initialParticipants: [chair, proposer, critic],
  });

  assert.equal(forum.participants.length, 3);
  assert.equal(forum.concluded, false);

  // 1. Proposer posts a proposal
  const propEnv = await forum.postProposal(
    proposer,
    'Adopt OPFS SQLite in Worker',
    { driver: 'better-sqlite3-wasm', threads: 1 }
  );

  assert.equal(propEnv.speechAct, 'PROPOSE');
  assert.ok(forum.activeProposal);
  assert.equal(forum.activeProposal.status, 'PROPOSED');

  // 2. Critic casts vote
  const vote1 = await forum.castVote(critic, 'approve', 'Performance benchmarks look great');
  assert.equal(vote1.quorumReached, false);
  assert.equal(forum.activeProposal.status, 'PROPOSED');

  // 3. Chair casts vote -> Quorum reached!
  const vote2 = await forum.castVote(chair, 'approve', 'Meets architectural constraints');
  assert.equal(vote2.quorumReached, true);
  assert.equal(forum.activeProposal.status, 'ACCEPTED');

  // 4. Chair synthesizes consensus
  const synthEnv = await forum.synthesizeConsensus(
    chair,
    'OPFS SQLite approved unanimously by 2 votes'
  );

  assert.equal(synthEnv.speechAct, 'SYNTHESIZE');
  assert.equal(forum.concluded, true);
});

test('Single-Node: BroadcastChannel manages 1:N monologue and telemetry publishing', async () => {
  const broadcaster = { nodeId: 'local', agentId: 'metrics_daemon' };
  const channel = new BroadcastChannel({
    topic: 'local:metrics',
    sender: broadcaster,
  });

  const received: any[] = [];
  const unsubscribe = channel.subscribe((env) => {
    received.push(env);
  });

  const env = await channel.publish({ cpuUsage: 0.12, memoryMb: 256 }, {
    summary: 'Heartbeat metrics',
  });

  assert.equal(env.conversationType, 'monolog');
  assert.equal(env.speechAct, 'INFORM');
  assert.equal(env.recipients, '*');
  assert.equal(received.length, 1);
  assert.equal(received[0].payload.cpuUsage, 0.12);

  unsubscribe();
});

test('Single-Node: QADispatcher executes RFP solicitation and winner award', async () => {
  const requester = { nodeId: 'local', agentId: 'task_coordinator' };
  const qa = new QADispatcher({
    conversationId: 'qa_local_optimize_query',
    requester,
    topic: 'Database Query Optimization',
    timeoutMs: 5000,
  });

  // 1. Solicit RFP
  await qa.solicit({
    query: 'Optimize recursive CTE query for category hierarchies',
    requiredTools: ['explain_query_plan'],
  });

  assert.equal(qa.status, 'OPEN');

  // 2. Candidate agents submit bids
  const bidder1 = { nodeId: 'local', agentId: 'sql_specialist_1' };
  const bid1 = await qa.submitBid(bidder1, {
    plan: 'Materialized path indexing',
    estimatedLatencyMs: 5,
  }, { score: 95 });

  const bidder2 = { nodeId: 'local', agentId: 'sql_specialist_2' };
  const bid2 = await qa.submitBid(bidder2, {
    plan: 'Recursive CTE with indexed parent_id',
    estimatedLatencyMs: 12,
  }, { score: 80 });

  assert.equal(qa.bids.length, 2);

  // 3. Award winner (bidder1)
  const awardResult = await qa.awardWinner(bid1.bidId, 'Fastest estimated latency');

  assert.equal(qa.status, 'AWARDED');
  assert.equal(qa.winner?.bidder.agentId, 'sql_specialist_1');
  assert.equal(awardResult.winnerEnvelope.speechAct, 'ACCEPT');
  assert.equal(awardResult.rejectEnvelopes.length, 1);
  assert.equal(awardResult.rejectEnvelopes[0].speechAct, 'REJECT');
});

test('Single-Node: ConversationRouter dispatches in-memory to local agents and resolves roles', async () => {
  const router = new ConversationRouter({
    localNodeId: 'local',
    localProjectId: 'proj_dev',
  });

  const agentMessages: any[] = [];
  router.registerLocalAgent('coder_agent', (envelope) => {
    agentMessages.push(envelope);
  });

  // Route outbound message to local agent
  const envelope = createAgentMessageEnvelope({
    conversationId: 'dlg_local_in_memory',
    conversationType: 'dialog',
    speechAct: 'REQUEST',
    sender: { nodeId: 'local', agentId: 'planner_agent' },
    recipients: [{ nodeId: 'local', agentId: 'coder_agent' }],
    payload: { action: 'format_code', file: 'index.ts' },
  });

  await router.routeOutbound(envelope);

  assert.equal(agentMessages.length, 1);
  assert.equal(agentMessages[0].payload.action, 'format_code');
  assert.equal(agentMessages[0].sender.agentId, 'planner_agent');
});
