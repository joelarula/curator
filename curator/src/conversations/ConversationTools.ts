import { defineTool, CuratorAccessLevel, type CuratorTool } from '../tools/CuratorTool.js';
import type {
  AgentEndpoint,
  AgentMessageEnvelope,
  ConversationLeaveOptions,
  ConversationRoomMetadata,
  StartConversationOptions,
  VoteChoice,
} from './types.js';
import type { ConversationRouter } from './ConversationRouter.js';

// ============================================================================
// 1. PURE DETERMINISTIC CONVERSATION REDUCERS & EVALUATORS
// ============================================================================

export interface QuorumEvaluation {
  approvals: number;
  rejections: number;
  abstentions: number;
  totalVotes: number;
  requiredVotes: number;
  quorumReached: boolean;
  approved: boolean;
  status: 'PROPOSED' | 'ACCEPTED' | 'REJECTED';
}

export function endpointKey(ep: Pick<AgentEndpoint, 'nodeId' | 'agentId'>): string {
  return `${ep.nodeId || 'local'}:${ep.agentId}`;
}

export function isSameEndpoint(
  a: Pick<AgentEndpoint, 'nodeId' | 'agentId'>,
  b: Pick<AgentEndpoint, 'nodeId' | 'agentId'>
): boolean {
  return (a.nodeId || 'local') === (b.nodeId || 'local') && a.agentId === b.agentId;
}

/**
 * Deterministically evaluates a ballot tally against a required vote threshold.
 */
export function evaluateQuorum(
  choices: Iterable<VoteChoice>,
  requiredVotes: number
): QuorumEvaluation {
  let approvals = 0;
  let rejections = 0;
  let abstentions = 0;

  for (const choice of choices) {
    if (choice === 'approve') approvals++;
    else if (choice === 'reject') rejections++;
    else abstentions++;
  }

  const totalVotes = approvals + rejections + abstentions;
  const quorumReached = totalVotes >= requiredVotes;
  const approved = quorumReached && approvals > rejections;

  return {
    approvals,
    rejections,
    abstentions,
    totalVotes,
    requiredVotes,
    quorumReached,
    approved,
    status: !quorumReached ? 'PROPOSED' : approved ? 'ACCEPTED' : 'REJECTED',
  };
}

/**
 * Pure deterministic reducer for initializing a ConversationRoomMetadata container.
 */
export function createInitialRoomMetadata(
  options: StartConversationOptions,
  localNodeId: string = 'local',
  localProjectId: string = '1'
): ConversationRoomMetadata {
  const roomUri = options.roomUri || `curator://${localNodeId}/rooms/${options.conversationId}`;
  const initialParticipants = options.initialParticipants ? [...options.initialParticipants] : [];
  const participatingProjects = options.projectId ? [options.projectId] : [localProjectId];

  return {
    conversationType: options.conversationType,
    roomUri,
    topic: options.topic,
    participants: initialParticipants,
    participatingProjects,
    governance: {
      mode: options.governanceMode || (options.conversationType === 'forum' ? 'moderated' : 'round-robin'),
      activeSpeaker: initialParticipants.length > 0 ? endpointKey(initialParticipants[0]) : undefined,
      currentTurn: 1,
    },
    quorum: options.requiredVotes !== undefined
      ? {
          requiredVotes: options.requiredVotes,
          tally: {},
          concluded: false,
        }
      : undefined,
    customState: {
      ruleset: options.ruleset || 'default',
      turn: 1,
      ...(options.initialState || {}),
    },
  };
}

/**
 * Pure deterministic reducer for adding/updating a participant in a room's roster.
 */
export function reduceRoomJoin(
  room: ConversationRoomMetadata,
  participant: AgentEndpoint
): ConversationRoomMetadata {
  const participants = [...(room.participants || [])];
  const idx = participants.findIndex((p) => isSameEndpoint(p, participant));
  if (idx >= 0) {
    participants[idx] = { ...participants[idx], ...participant };
  } else {
    participants.push(participant);
  }

  const projectSet = new Set<string>(room.participatingProjects || []);
  if (participant.projectId) {
    projectSet.add(participant.projectId);
  }

  const activeSpeaker = room.governance?.activeSpeaker || endpointKey(participant);

  return {
    ...room,
    participants,
    participatingProjects: Array.from(projectSet),
    governance: room.governance
      ? { ...room.governance, activeSpeaker }
      : { mode: 'round-robin', activeSpeaker, currentTurn: 1 },
  };
}

/**
 * Pure deterministic reducer for removing a participant, releasing floor if held,
 * and recalibrating quorum requirements.
 */
export function reduceRoomLeave(
  room: ConversationRoomMetadata,
  agentId: string,
  options: ConversationLeaveOptions = {}
): { metadata: ConversationRoomMetadata; floorReleased: boolean } {
  const remainingParticipants = (room.participants || []).filter((p) => p.agentId !== agentId);

  let floorReleased = false;
  let activeSpeaker = room.governance?.activeSpeaker;
  if (activeSpeaker && (activeSpeaker === agentId || activeSpeaker.endsWith(`:${agentId}`))) {
    activeSpeaker = undefined;
    floorReleased = true;
  }

  let quorum = room.quorum ? { ...room.quorum, tally: { ...room.quorum.tally } } : undefined;
  if (quorum && !quorum.concluded) {
    delete quorum.tally[agentId];
    if (options.graceful !== false && quorum.requiredVotes > 1) {
      const remainingCount = remainingParticipants.length;
      if (remainingCount > 0 && quorum.requiredVotes > remainingCount) {
        quorum.requiredVotes = remainingCount;
      }
    }
  }

  return {
    metadata: {
      ...room,
      participants: remainingParticipants,
      governance: room.governance ? { ...room.governance, activeSpeaker } : undefined,
      quorum,
    },
    floorReleased,
  };
}

/**
 * Pure deterministic reducer for applying an incoming or outbound envelope turn to room metadata.
 */
export function reduceRoomTurn(
  room: ConversationRoomMetadata,
  envelope: AgentMessageEnvelope
): { metadata: ConversationRoomMetadata; quorumJustConcluded: boolean } {
  const joined = reduceRoomJoin(room, envelope.sender);
  const projectSet = new Set<string>(joined.participatingProjects || []);
  if (Array.isArray(envelope.recipients)) {
    for (const r of envelope.recipients) {
      if (r.projectId) projectSet.add(r.projectId);
    }
  }

  let quorumJustConcluded = false;
  let quorum = joined.quorum ? { ...joined.quorum, tally: { ...joined.quorum.tally } } : undefined;
  const voteChoice = (envelope.payload?.vote || envelope.payload?.ballot) as VoteChoice | undefined;
  if (envelope.speechAct === 'VOTE' && voteChoice && quorum) {
    quorum.tally[envelope.sender.agentId] = voteChoice;
    if (!quorum.concluded && Object.keys(quorum.tally).length >= quorum.requiredVotes) {
      quorum.concluded = true;
      quorumJustConcluded = true;
    }
  }

  const isOutOfTurn = Boolean(envelope.payload?.outOfTurn);
  const currentTurn = isOutOfTurn
    ? (joined.governance?.currentTurn ?? envelope.turn)
    : envelope.turn;

  return {
    metadata: {
      ...joined,
      conversationType: envelope.conversationType || joined.conversationType,
      topic: envelope.topic || joined.topic,
      participatingProjects: Array.from(projectSet),
      governance: {
        mode: joined.governance?.mode || 'round-robin',
        activeSpeaker: endpointKey(envelope.sender),
        currentTurn,
        maxTurns: joined.governance?.maxTurns,
      },
      quorum,
      customState: {
        ...(joined.customState || {}),
        ...(envelope.contextState || {}),
        lastSpeechAct: envelope.speechAct,
        lastMessageId: envelope.messageId,
        lastUpdatedAt: envelope.timestamp,
      },
    },
    quorumJustConcluded,
  };
}

// ============================================================================
// 2. DETERMINISTIC CURATOR TOOLS FOR AST WORKFLOWS & MINIAPPS
// ============================================================================

export const ConversationToolName = {
  START: 'conversation_start',
  JOIN: 'conversation_join',
  LEAVE: 'conversation_leave',
  VOTE: 'conversation_vote',
  SYNC: 'conversation_sync',
  RESOLVE_ROLE: 'conversation_resolve_role',
  GRANT_LEASE: 'conversation_grant_lease',
  REVOKE_LEASE: 'conversation_revoke_lease',
} as const;

/**
 * Builds standard CuratorTools bound to a ConversationRouter so AST workflows
 * can execute deterministic conversation operations via `Curator_Tool` / `host.runTool`.
 */
export function createConversationTools(router: ConversationRouter): CuratorTool[] {
  const startTool = defineTool<StartConversationOptions>({
    name: ConversationToolName.START,
    description: 'Deterministically initializes a persistent conversation container and room governance state.',
    accessLevel: CuratorAccessLevel.SAFE_WRITE,
    parameters: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        conversationType: { type: 'string', enum: ['monolog', 'dialog', 'forum', 'qa'] },
        topic: { type: 'string' },
        governanceMode: { type: 'string', enum: ['moderated', 'round-robin', 'quorum', 'free-floor'] },
        requiredVotes: { type: 'number' },
        ruleset: { type: 'string' },
        initialState: { type: 'object' },
      },
      required: ['conversationId', 'conversationType'],
    },
    execute: async (args, ctx) => {
      const convId = args.conversationId || String(ctx.conversationId || `conv_${Date.now()}`);
      return router.startConversation({
        ...args,
        conversationId: convId,
        projectId: args.projectId || (ctx.projectId !== undefined ? String(ctx.projectId) : undefined),
        userId: args.userId || (ctx.userId !== undefined ? String(ctx.userId) : undefined),
      });
    },
  });

  const joinTool = defineTool<{
    conversationId?: string;
    agentId: string;
    nodeId?: string;
    conversationalRole?: string;
    capabilities?: string[];
    leaseDurationMs?: number;
  }>({
    name: ConversationToolName.JOIN,
    description: 'Deterministically joins an agent to a conversation with role binding, capability leases, and catchup snapshot.',
    accessLevel: CuratorAccessLevel.SAFE_WRITE,
    parameters: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        agentId: { type: 'string' },
        nodeId: { type: 'string' },
        conversationalRole: { type: 'string' },
        capabilities: { type: 'array', items: { type: 'string' } },
        leaseDurationMs: { type: 'number' },
      },
      required: ['agentId'],
    },
    execute: async (args, ctx) => {
      const convId = args.conversationId || String(ctx.conversationId || 'default');
      return router.joinConversation(
        convId,
        {
          nodeId: args.nodeId || router.localNodeId,
          agentId: args.agentId,
          conversationalRole: args.conversationalRole,
          role: args.conversationalRole,
          projectId: ctx.projectId !== undefined ? String(ctx.projectId) : router.localProjectId,
        },
        {
          conversationalRole: args.conversationalRole,
          capabilities: args.capabilities,
          leaseDurationMs: args.leaseDurationMs,
        }
      );
    },
  });

  const leaveTool = defineTool<{
    conversationId?: string;
    agentId: string;
    reason?: string;
    concede?: boolean;
    graceful?: boolean;
  }>({
    name: ConversationToolName.LEAVE,
    description: 'Deterministically removes an agent from a conversation, releasing the floor, revoking leases, and recalibrating quorum.',
    accessLevel: CuratorAccessLevel.SAFE_WRITE,
    parameters: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        agentId: { type: 'string' },
        reason: { type: 'string' },
        concede: { type: 'boolean' },
        graceful: { type: 'boolean' },
      },
      required: ['agentId'],
    },
    execute: async (args, ctx) => {
      const convId = args.conversationId || String(ctx.conversationId || 'default');
      return router.leaveConversation(convId, args.agentId, {
        reason: args.reason,
        concede: args.concede,
        graceful: args.graceful,
      });
    },
  });

  const voteTool = defineTool<{
    conversationId?: string;
    agentId: string;
    ballot: VoteChoice;
    rationale?: string;
  }>({
    name: ConversationToolName.VOTE,
    description: 'Deterministically records a ballot in a forum quorum and evaluates whether consensus threshold is met.',
    accessLevel: CuratorAccessLevel.SAFE_WRITE,
    parameters: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        agentId: { type: 'string' },
        ballot: { type: 'string', enum: ['approve', 'reject', 'abstain'] },
        rationale: { type: 'string' },
      },
      required: ['agentId', 'ballot'],
    },
    execute: async (args, ctx) => {
      const convId = args.conversationId || String(ctx.conversationId || 'default');
      const res = await router.processEventIn({
        conversationId: convId,
        conversationType: 'forum',
        speechAct: 'VOTE',
        sender: { nodeId: router.localNodeId, agentId: args.agentId },
        payload: { vote: args.ballot, ballot: args.ballot, rationale: args.rationale },
      });
      const room = router.sessionManager.getConversation(convId);
      const evaluation = room?.quorum
        ? evaluateQuorum(Object.values(room.quorum.tally), room.quorum.requiredVotes)
        : undefined;
      return { envelope: res.result, quorum: room?.quorum, evaluation };
    },
  });

  const syncTool = defineTool<{ conversationId?: string; targetAgentId?: string }>({
    name: ConversationToolName.SYNC,
    description: 'Generates a deterministic state catch-up snapshot for a conversation.',
    accessLevel: CuratorAccessLevel.SAFE_READ,
    parameters: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        targetAgentId: { type: 'string' },
      },
    },
    execute: async (args, ctx) => {
      const convId = args.conversationId || String(ctx.conversationId || 'default');
      return router.syncState(convId, args.targetAgentId);
    },
  });

  const resolveRoleTool = defineTool<{ roleName: string; conversationId?: string }>({
    name: ConversationToolName.RESOLVE_ROLE,
    description: 'Deterministically resolves a communicative role name to physical agent endpoints.',
    accessLevel: CuratorAccessLevel.SAFE_READ,
    parameters: {
      type: 'object',
      properties: {
        roleName: { type: 'string' },
        conversationId: { type: 'string' },
      },
      required: ['roleName'],
    },
    execute: async (args, ctx) => {
      const convId = args.conversationId || (ctx.conversationId !== undefined ? String(ctx.conversationId) : undefined);
      return router.resolveRole(args.roleName, convId);
    },
  });

  const grantLeaseTool = defineTool<{
    toolName: string;
    granteePeerId: string;
    conversationId?: string;
    durationMs?: number;
    maxInvocations?: number;
  }>({
    name: ConversationToolName.GRANT_LEASE,
    description: 'Deterministically grants a time-bounded or invocation-bounded tool capability lease to a peer/agent.',
    accessLevel: CuratorAccessLevel.SAFE_WRITE,
    parameters: {
      type: 'object',
      properties: {
        toolName: { type: 'string' },
        granteePeerId: { type: 'string' },
        conversationId: { type: 'string' },
        durationMs: { type: 'number' },
        maxInvocations: { type: 'number' },
      },
      required: ['toolName', 'granteePeerId'],
    },
    execute: async (args, ctx) => {
      return router.exposure.grantLease({
        ...args,
        conversationId: args.conversationId || (ctx.conversationId !== undefined ? String(ctx.conversationId) : undefined),
      });
    },
  });

  const revokeLeaseTool = defineTool<{ leaseId: string; reason?: string }>({
    name: ConversationToolName.REVOKE_LEASE,
    description: 'Deterministically revokes an active ephemeral tool lease.',
    accessLevel: CuratorAccessLevel.SAFE_WRITE,
    parameters: {
      type: 'object',
      properties: {
        leaseId: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['leaseId'],
    },
    execute: async (args) => {
      const revoked = router.exposure.revokeLease(args.leaseId, args.reason);
      return { leaseId: args.leaseId, revoked };
    },
  });

  return [
    startTool,
    joinTool,
    leaveTool,
    voteTool,
    syncTool,
    resolveRoleTool,
    grantLeaseTool,
    revokeLeaseTool,
  ];
}
