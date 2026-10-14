import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAgentMessageEnvelope,
  validateAgentMessageEnvelope,
  isAgentMessageEnvelope,
  type AgentMessageEnvelope,
} from '../dist/conversations/index.js';

test('createAgentMessageEnvelope generates valid envelope with defaults', () => {
  const envelope = createAgentMessageEnvelope({
    conversationId: 'conv_dialog_123',
    conversationType: 'dialog',
    speechAct: 'REQUEST',
    sender: { nodeId: 'node-alpha', agentId: 'architect', role: 'chair' },
    recipients: [{ nodeId: 'node-beta', agentId: 'coder' }],
    payload: { task: 'refactor_auth' },
  });

  assert.ok(envelope.messageId.startsWith('msg_'));
  assert.equal(envelope.conversationId, 'conv_dialog_123');
  assert.equal(envelope.conversationType, 'dialog');
  assert.equal(envelope.speechAct, 'REQUEST');
  assert.equal(envelope.sender.nodeId, 'node-alpha');
  assert.equal(envelope.sender.agentId, 'architect');
  assert.equal(envelope.recipients.length, 1);
  assert.equal(envelope.turn, 1);
  assert.equal(envelope.hops, 0);
  assert.equal(envelope.maxHops, 5);
  assert.ok(new Date(envelope.timestamp).getTime() > 0);
  assert.equal(envelope.expiresAt, undefined);
  assert.ok(isAgentMessageEnvelope(envelope));
});

test('createAgentMessageEnvelope handles monolog / broadcast with recipient wildcard', () => {
  const envelope = createAgentMessageEnvelope({
    conversationId: 'conv_telemetry',
    conversationType: 'monolog',
    speechAct: 'INFORM',
    sender: { nodeId: 'host-1', agentId: 'telemetry_agent' },
    topic: 'system:telemetry',
    payload: { cpu: 0.15, memoryMb: 512 },
    expiresInMs: 10000,
  });

  assert.equal(envelope.recipients, '*');
  assert.equal(envelope.speechAct, 'INFORM');
  assert.equal(envelope.conversationType, 'monolog');
  assert.ok(envelope.expiresAt);
  assert.ok(new Date(envelope.expiresAt).getTime() > new Date(envelope.timestamp).getTime());
});

test('validateAgentMessageEnvelope rejects invalid envelopes', () => {
  // Missing conversationId
  const res1 = validateAgentMessageEnvelope({
    messageId: 'msg_1',
    conversationId: '',
    sender: { nodeId: 'n1', agentId: 'a1' },
    conversationType: 'dialog',
    speechAct: 'INFORM',
    turn: 1,
    timestamp: new Date().toISOString(),
    hops: 0,
    recipients: [],
  });
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e: string) => e.includes('conversationId')));

  // Invalid speech act
  const res2 = validateAgentMessageEnvelope({
    messageId: 'msg_1',
    conversationId: 'conv_1',
    sender: { nodeId: 'n1', agentId: 'a1' },
    conversationType: 'dialog',
    speechAct: 'FLY_TO_MOON',
    turn: 1,
    timestamp: new Date().toISOString(),
    hops: 0,
    recipients: [],
  });
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e: string) => e.includes('speechAct')));

  // Invalid turn (< 1)
  const res3 = validateAgentMessageEnvelope({
    messageId: 'msg_1',
    conversationId: 'conv_1',
    sender: { nodeId: 'n1', agentId: 'a1' },
    conversationType: 'dialog',
    speechAct: 'PROPOSE',
    turn: 0,
    timestamp: new Date().toISOString(),
    hops: 0,
    recipients: [],
  });
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some((e: string) => e.includes('turn')));
});

test('createAgentMessageEnvelope supports forum voting with context state', () => {
  const envelope = createAgentMessageEnvelope({
    conversationId: 'forum_rfc_42',
    conversationType: 'forum',
    speechAct: 'VOTE',
    sender: { nodeId: 'node-gamma', agentId: 'reviewer', role: 'critic' },
    topic: 'p2p-envelopes',
    turn: 4,
    contextState: { currentQuorum: 2, votedMembers: ['coder', 'reviewer'] },
    payload: { ballot: 'approve', rationale: 'AST execution contracts met' },
  });

  assert.equal(envelope.speechAct, 'VOTE');
  assert.equal(envelope.turn, 4);
  assert.equal(envelope.contextState?.currentQuorum, 2);
  assert.equal(envelope.payload.ballot, 'approve');
  assert.equal(isAgentMessageEnvelope(envelope), true);
});

test('ConversationManager persists rooms, turns, and requests to Prisma', async () => {
  const { ConversationManager } = await import('../dist/conversations/index.js');

  const conversations = new Map<number, any>();
  const responses: any[] = [];
  const requests: any[] = [];
  let convIdSeq = 1;

  const mockPrisma = {
    conversation: {
      findUnique: async ({ where }: any) => {
        if (where.id) return conversations.get(where.id);
        if (where.externalId) {
          for (const c of conversations.values()) {
            if (c.externalId === where.externalId) return c;
          }
        }
        return null;
      },
      create: async ({ data }: any) => {
        const id = convIdSeq++;
        const record = { id, ...data };
        conversations.set(id, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const existing = conversations.get(where.id);
        if (!existing) throw new Error('Not found');
        const updated = { ...existing, ...data };
        conversations.set(where.id, updated);
        return updated;
      },
    },
    response: {
      create: async ({ data }: any) => {
        responses.push(data);
        return { id: responses.length, ...data };
      },
    },
    request: {
      create: async ({ data }: any) => {
        requests.push(data);
        return { id: requests.length, ...data };
      },
    },
  };

  const manager = new ConversationManager({
    prisma: mockPrisma,
    defaultProjectId: 'proj_p2p',
    defaultUserId: 'user_p2p',
  });

  const envelope = createAgentMessageEnvelope({
    conversationId: 'room_architecture_debate',
    conversationType: 'forum',
    speechAct: 'PROPOSE',
    sender: { nodeId: 'host-alpha', agentId: 'lead_dev', role: 'proposer' },
    topic: 'P2P Conversational Stack',
    turn: 1,
    payload: { title: 'Adopt Envelopes' },
  });

  // 1. First turn: create room
  const room = await manager.findOrCreateRoom(envelope);
  assert.equal(room.externalId, 'room_architecture_debate');
  assert.equal(room.metadata.conversationType, 'forum');
  assert.equal(room.metadata.participants.length, 1);

  // 2. Record turn response
  await manager.recordTurn(room, envelope);
  assert.equal(responses.length, 1);
  assert.equal(responses[0].conversationId, room.id);

  // 3. Second turn from peer: update room participants
  const peerEnvelope = createAgentMessageEnvelope({
    conversationId: 'room_architecture_debate',
    conversationType: 'forum',
    speechAct: 'VOTE',
    sender: { nodeId: 'host-beta', agentId: 'peer_reviewer', role: 'critic' },
    topic: 'P2P Conversational Stack',
    turn: 2,
    payload: { ballot: 'approve' },
  });

  const updatedRoom = await manager.findOrCreateRoom(peerEnvelope);
  assert.equal(updatedRoom.metadata.participants.length, 2);
  assert.equal(updatedRoom.metadata.governance.currentTurn, 2);

  // 4. Create turn request
  const req = await manager.createTurnRequest(
    updatedRoom,
    peerEnvelope,
    { type: 'Curator_Agent', prompt: 'Process vote' }
  );
  assert.equal(req.status, 'NEW');
  assert.equal(requests.length, 1);
});

test('ConversationManager supports intra-node cross-project SpeechAct routing', async () => {
  const { ConversationManager } = await import('../dist/conversations/index.js');

  const conversations = new Map<number, any>();
  let convIdSeq = 1;

  const mockPrisma = {
    conversation: {
      findUnique: async ({ where }: any) => {
        if (where.id) return conversations.get(where.id);
        if (where.externalId) {
          for (const c of conversations.values()) {
            if (c.externalId === where.externalId) return c;
          }
        }
        return null;
      },
      create: async ({ data }: any) => {
        const id = convIdSeq++;
        const record = { id, ...data };
        conversations.set(id, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const existing = conversations.get(where.id);
        if (!existing) throw new Error('Not found');
        const updated = { ...existing, ...data };
        conversations.set(where.id, updated);
        return updated;
      },
    },
  };

  const manager = new ConversationManager({
    prisma: mockPrisma,
    defaultProjectId: 'proj_alpha',
    defaultUserId: 'user_1',
  });

  // Intra-node agent on Project A sends REQUEST to an agent on Project B
  const crossProjectEnvelope = createAgentMessageEnvelope({
    conversationId: 'dlg_cross_proj_001',
    conversationType: 'dialog',
    speechAct: 'REQUEST',
    sender: {
      nodeId: 'local',
      projectId: 'proj_alpha',
      agentId: 'frontend_coder',
    },
    recipients: [
      {
        nodeId: 'local',
        projectId: 'proj_beta',
        agentId: 'db_architect',
      },
    ],
    payload: { action: 'request_schema', entity: 'User' },
  });

  const room = await manager.findOrCreateRoom(crossProjectEnvelope, { projectId: 'proj_alpha' });
  assert.equal(room.externalId, 'dlg_cross_proj_001');
  assert.ok(room.metadata.participatingProjects.includes('proj_alpha'));
  assert.ok(room.metadata.participatingProjects.includes('proj_beta'));
  assert.equal(room.metadata.participants[0].agentId, 'frontend_coder');
});
