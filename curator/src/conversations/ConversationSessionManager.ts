import { EventEmitter } from 'events';
import { appendStatePatch } from '../engine/ConversationStateLog.js';
import type {
  AgentEndpoint,
  AgentMessageEnvelope,
  ConversationRoomMetadata,
  ConversationSession,
  ConversationType,
  StartConversationOptions,
  ConversationJoinOptions,
  ConversationLeaveOptions,
  ConversationStateCatchup,
  SessionStatus,
  ForumGovernanceMode,
} from './types.js';
import { createAgentMessageEnvelope, validateAgentMessageEnvelope } from './EnvelopeValidator.js';
import type { ConversationRouter } from './ConversationRouter.js';
import type { ConversationManager } from './ConversationManager.js';

export interface EphemeralLeaseRecord {
  leaseId: string;
  sessionId: string;
  agentId: string;
  capabilities: string[];
  expiresAt: number;
}

export interface ConversationSessionManagerOptions {
  localNodeId?: string;
  localProjectId?: string;
  router?: ConversationRouter;
  manager?: ConversationManager;
  prisma?: any;
}

/**
 * ConversationSessionManager:
 * Formalizes the Session vs. Conversation lifecycle architecture.
 *
 * - Conversation (Epistemic/Persistent Container):
 *   Carries room URI, $context state, commitment store C_a, turn counts,
 *   governance rules, and database entity history.
 *
 * - Session (Operational/Ephemeral Connection):
 *   Carries socket connection IDs, presence heartbeats, floor lock allocations,
 *   and time-bounded capability leases (EphemeralToolLease).
 */
export class ConversationSessionManager extends EventEmitter {
  public readonly localNodeId: string;
  public readonly localProjectId: string;

  private router?: ConversationRouter;
  private manager?: ConversationManager;
  private prisma?: any;

  // Ephemeral Sessions indexed by sessionId
  private sessions: Map<string, ConversationSession> = new Map();
  // Connection ID to sessionId index
  private connectionIndex: Map<string, string> = new Map();
  // Ephemeral capability leases indexed by leaseId
  private activeLeases: Map<string, EphemeralLeaseRecord> = new Map();

  // In-memory conversation state cache
  private conversations: Map<string, ConversationRoomMetadata> = new Map();
  // Context state snapshot per conversation
  private contextStateMap: Map<string, Record<string, unknown>> = new Map();
  // Recent turns buffer per conversation (last 50 turns)
  private turnHistoryMap: Map<string, AgentMessageEnvelope[]> = new Map();

  constructor(options: ConversationSessionManagerOptions = {}) {
    super();
    this.localNodeId = options.localNodeId || 'local';
    this.localProjectId = options.localProjectId || '1';
    this.router = options.router;
    this.manager = options.manager;
    this.prisma = options.prisma;
  }

  /**
   * Sets or attaches the ConversationRouter.
   */
  public setRouter(router: ConversationRouter): void {
    this.router = router;
  }

  // ==========================================================================
  // 1. CONVERSATION CONTAINER LIFECYCLE (Starting & Instantiating)
  // ==========================================================================

  /**
   * Starts a new persistent conversation container.
   * Initializes room governance, epistemic context state, and participant roster.
   */
  public async startConversation(options: StartConversationOptions): Promise<ConversationRoomMetadata> {
    const conversationId = options.conversationId;
    const roomUri = options.roomUri || `curator://${this.localNodeId}/rooms/${conversationId}`;
    const initialParticipants = options.initialParticipants || [];
    const participatingProjects = options.projectId
      ? [options.projectId]
      : [this.localProjectId];

    const metadata: ConversationRoomMetadata = {
      conversationType: options.conversationType,
      roomUri,
      topic: options.topic,
      participants: [...initialParticipants],
      participatingProjects,
      governance: {
        mode: options.governanceMode || (options.conversationType === 'forum' ? 'moderated' : 'round-robin'),
        activeSpeaker: initialParticipants.length > 0 ? `${initialParticipants[0].nodeId}:${initialParticipants[0].agentId}` : undefined,
        currentTurn: 1,
      },
      quorum: options.requiredVotes !== undefined ? {
        requiredVotes: options.requiredVotes,
        tally: {},
        concluded: false,
      } : undefined,
      customState: {
        ruleset: options.ruleset || 'default',
        turn: 1,
        ...(options.initialState || {}),
      },
    };

    this.conversations.set(conversationId, metadata);
    this.contextStateMap.set(conversationId, { ...(metadata.customState || {}) });
    this.turnHistoryMap.set(conversationId, []);

    // Persist to Prisma if available
    if (this.prisma?.conversation?.create) {
      try {
        const created = await this.prisma.conversation.create({
          data: {
            externalId: conversationId,
            projectId: options.projectId || this.localProjectId,
            userId: options.userId || '1',
          },
        });
        await appendStatePatch(this.prisma, created.id, { set: metadata as Record<string, any> });
      } catch (err) {
        this.emit('warn', `Failed to persist conversation '${conversationId}' to DB: ${err}`);
      }
    }

    this.emit('conversation:started', { conversationId, metadata });
    return metadata;
  }

  /**
   * Retrieves conversation room metadata.
   */
  public getConversation(conversationId: string): ConversationRoomMetadata | undefined {
    return this.conversations.get(conversationId);
  }

  // ==========================================================================
  // 2. SESSION LIFECYCLE (Connecting & Presence)
  // ==========================================================================

  /**
   * Connects a low-level transport session (e.g. WebSocket connection, worker port).
   */
  public connectSession(
    connectionId: string,
    participant: AgentEndpoint,
    metadata?: Record<string, unknown>
  ): ConversationSession {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const session: ConversationSession = {
      sessionId,
      conversationId: '',
      connectionId,
      participant: {
        ...participant,
        nodeId: participant.nodeId || this.localNodeId,
      },
      conversationalRole: participant.conversationalRole || participant.role,
      activeLeases: [],
      connectedAt: now,
      lastHeartbeat: now,
      status: 'connected',
      metadata,
    };

    this.sessions.set(sessionId, session);
    this.connectionIndex.set(connectionId, sessionId);

    this.emit('session:connected', session);
    return session;
  }

  /**
   * Refreshes liveness for an active session via heartbeat.
   */
  public heartbeat(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.lastHeartbeat = new Date().toISOString();
    if (session.status === 'reconnecting') {
      session.status = 'connected';
    }

    this.emit('session:heartbeat', { sessionId, lastHeartbeat: session.lastHeartbeat });
    return true;
  }

  /**
   * Checks for timed out sessions exceeding the timeout threshold.
   */
  public checkTimeouts(timeoutMs: number = 30000): ConversationSession[] {
    const now = Date.now();
    const timedOut: ConversationSession[] = [];

    for (const [, session] of this.sessions) {
      if (session.status === 'connected' || session.status === 'reconnecting') {
        const lastHb = new Date(session.lastHeartbeat).getTime();
        if (now - lastHb >= timeoutMs) {
          session.status = 'timed_out';
          timedOut.push(session);

          // Floor release on timeout if active speaker
          if (session.conversationId) {
            this.releaseFloorIfActiveSpeaker(session.conversationId, session.participant.agentId);
          }

          this.emit('session:timeout', session);
        }
      }
    }

    return timedOut;
  }

  // ==========================================================================
  // 3. JOINING CONVERSATION (Handshake, Role Binding, Leases, State Catch-Up)
  // ==========================================================================

  /**
   * Joins a participant session to an active conversation container.
   * Performs:
   * - Ephemeral session creation/attachment
   * - Conversational role binding (decoupled from security RBAC permissions)
   * - Ephemeral capability leases grant (TTL-bounded tool access)
   * - Participant presence registration in room roster
   * - State Catch-up snapshot generation
   * - Dispatches 'JOIN' speech act envelope to the conversation
   */
  public async joinConversation(
    conversationId: string,
    participant: AgentEndpoint,
    options: ConversationJoinOptions = {}
  ): Promise<{
    session: ConversationSession;
    catchup: ConversationStateCatchup;
    envelope: AgentMessageEnvelope;
  }> {
    // 1. Ensure conversation container exists
    let conversation = this.conversations.get(conversationId);
    if (!conversation) {
      conversation = await this.startConversation({
        conversationId,
        conversationType: 'forum',
        governanceMode: 'moderated',
      });
    }

    // 2. Resolve or create operational session
    let session: ConversationSession | undefined;
    if (options.connectionId && this.connectionIndex.has(options.connectionId)) {
      const sessId = this.connectionIndex.get(options.connectionId)!;
      session = this.sessions.get(sessId);
    }

    const assignedRole = options.conversationalRole || options.as_role || participant.conversationalRole || participant.role;
    const now = new Date().toISOString();

    if (!session) {
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      session = {
        sessionId,
        conversationId,
        connectionId: options.connectionId,
        participant: {
          ...participant,
          nodeId: participant.nodeId || this.localNodeId,
          conversationalRole: assignedRole,
          role: assignedRole,
        },
        conversationalRole: assignedRole,
        activeLeases: [],
        connectedAt: now,
        lastHeartbeat: now,
        status: 'connected',
        metadata: options.metadata,
      };
      this.sessions.set(sessionId, session);
      if (options.connectionId) {
        this.connectionIndex.set(options.connectionId, sessionId);
      }
    } else {
      session.conversationId = conversationId;
      session.status = 'connected';
      session.lastHeartbeat = now;
      if (assignedRole) {
        session.conversationalRole = assignedRole;
        session.participant.conversationalRole = assignedRole;
        session.participant.role = assignedRole;
      }
    }

    // 3. Grant ephemeral capability leases if requested
    if (options.capabilities && options.capabilities.length > 0) {
      const leaseIds = this.grantEphemeralLease(
        session.sessionId,
        options.capabilities,
        options.leaseDurationMs || 60000
      );
      session.activeLeases = leaseIds;
    }

    // 4. Update conversation participant roster
    const exists = conversation.participants.some(
      p => p.nodeId === session!.participant.nodeId && p.agentId === session!.participant.agentId
    );
    if (!exists) {
      conversation.participants.push(session.participant);
    } else {
      // Update role if changed
      const idx = conversation.participants.findIndex(
        p => p.nodeId === session!.participant.nodeId && p.agentId === session!.participant.agentId
      );
      if (idx >= 0) {
        conversation.participants[idx] = session.participant;
      }
    }

    // Add project ID to participating projects
    if (participant.projectId && !conversation.participatingProjects?.includes(participant.projectId)) {
      conversation.participatingProjects = conversation.participatingProjects || [];
      conversation.participatingProjects.push(participant.projectId);
    }

    // 5. Generate State Catch-Up Snapshot
    const catchup = this.createCatchupSnapshot(conversationId);

    // 6. Create & Dispatch 'JOIN' Speech Act Envelope
    const joinEnvelope = createAgentMessageEnvelope({
      conversationId,
      conversationType: conversation.conversationType,
      communicationForm: conversation.conversationType === 'dialog' ? 'dialogue' : 'polylogue',
      turnDynamics: conversation.governance?.mode === 'round-robin' ? 'alternating' : 'moderated_floor',
      intent: 'assertive',
      speechAct: 'JOIN',
      sender: session.participant,
      recipients: '*',
      topic: 'session:join',
      payload: {
        action: 'join',
        sessionId: session.sessionId,
        conversationalRole: assignedRole,
        capabilities: options.capabilities || [],
        joinedAt: now,
      },
      turn: catchup.turn,
      contextState: catchup.contextState,
    });

    this.recordEnvelope(conversationId, joinEnvelope);

    // Forward through router if configured
    if (this.router) {
      await this.router.routeOutbound(joinEnvelope);
    }

    this.emit('conversation:joined', { session, catchup, envelope: joinEnvelope });
    this.emit('session:joined', session);

    return { session, catchup, envelope: joinEnvelope };
  }

  // ==========================================================================
  // 4. LEAVING CONVERSATION (Floor Release, Leases Revocation, Quorum Recalibration)
  // ==========================================================================

  /**
   * Leaves an active conversation.
   * Performs:
   * - Active floor release if leaving participant holds the floor
   * - Ephemeral capability leases revocation
   * - Quorum recalibration for forum deliberations
   * - Session status update
   * - Dispatches 'LEAVE' speech act envelope
   */
  public async leaveConversation(
    conversationId: string,
    agentId: string,
    options: ConversationLeaveOptions = {}
  ): Promise<AgentMessageEnvelope> {
    const conversation = this.conversations.get(conversationId);
    const sessions = this.getSessionsForConversation(conversationId);
    const session = sessions.find(s => s.participant.agentId === agentId);

    const now = new Date().toISOString();

    // 1. Revoke Ephemeral Leases
    if (session) {
      this.revokeEphemeralLeases(session.sessionId);
      session.status = 'disconnected';
    }

    // 2. Floor Release
    this.releaseFloorIfActiveSpeaker(conversationId, agentId);

    // 3. Quorum Recalibration
    if (conversation?.quorum && !conversation.quorum.concluded) {
      delete conversation.quorum.tally[agentId];
      if (options.graceful !== false && conversation.quorum.requiredVotes > 1) {
        // Recalibrate required votes if active member count shrunk below required threshold
        const remainingActive = conversation.participants.filter(p => p.agentId !== agentId).length;
        if (remainingActive > 0 && conversation.quorum.requiredVotes > remainingActive) {
          conversation.quorum.requiredVotes = remainingActive;
        }
      }
    }

    // 4. Update Participant Roster
    if (conversation) {
      conversation.participants = conversation.participants.filter(p => p.agentId !== agentId);
    }

    // 5. Build 'LEAVE' Speech Act Envelope
    const leaveEnvelope = createAgentMessageEnvelope({
      conversationId,
      conversationType: conversation?.conversationType || 'forum',
      speechAct: 'LEAVE',
      sender: session?.participant || {
        nodeId: this.localNodeId,
        agentId,
        conversationalRole: '$context.senderRole',
      },
      recipients: '*',
      topic: 'session:leave',
      payload: {
        action: 'leave',
        agentId,
        reason: options.reason || 'normal_leave',
        concede: options.concede === true,
        graceful: options.graceful !== false,
        leftAt: now,
      },
      turn: conversation?.governance?.currentTurn || 1,
      contextState: this.contextStateMap.get(conversationId) || {},
    });

    this.recordEnvelope(conversationId, leaveEnvelope);

    if (this.router) {
      await this.router.routeOutbound(leaveEnvelope);
    }

    this.emit('conversation:left', { conversationId, agentId, envelope: leaveEnvelope, options });
    if (session) {
      this.emit('session:left', session);
    }

    return leaveEnvelope;
  }

  // ==========================================================================
  // 5. STATE CATCH-UP & SYNCHRONIZATION
  // ==========================================================================

  /**
   * Generates a comprehensive state catch-up snapshot for a reconnecting participant.
   */
  public createCatchupSnapshot(conversationId: string): ConversationStateCatchup {
    const conversation = this.conversations.get(conversationId);
    const contextState = this.contextStateMap.get(conversationId) || {};
    const recentTurns = this.turnHistoryMap.get(conversationId) || [];

    return {
      conversationId,
      conversationType: conversation?.conversationType || 'forum',
      turn: conversation?.governance?.currentTurn || (contextState.turn as number) || 1,
      contextState: { ...contextState },
      participants: conversation?.participants ? [...conversation.participants] : [],
      activeSpeaker: conversation?.governance?.activeSpeaker,
      recentTurns: [...recentTurns.slice(-20)],
      commitments: (contextState.activeCommitments as Record<string, unknown>) || {},
    };
  }

  /**
   * Produces a 'SYNC' speech act envelope and state snapshot.
   */
  public async syncState(
    conversationId: string,
    targetAgentId?: string
  ): Promise<{ catchup: ConversationStateCatchup; envelope: AgentMessageEnvelope }> {
    const catchup = this.createCatchupSnapshot(conversationId);

    const recipients = targetAgentId
      ? [{ nodeId: this.localNodeId, agentId: targetAgentId }]
      : '*';

    const envelope = createAgentMessageEnvelope({
      conversationId,
      conversationType: catchup.conversationType,
      speechAct: 'SYNC',
      sender: {
        nodeId: this.localNodeId,
        agentId: 'system:orchestrator',
        conversationalRole: 'moderator',
      },
      recipients,
      topic: 'session:sync',
      payload: catchup,
      turn: catchup.turn,
      contextState: catchup.contextState,
    });

    this.recordEnvelope(conversationId, envelope);

    if (this.router) {
      await this.router.routeOutbound(envelope);
    }

    this.emit('conversation:sync', { conversationId, catchup, envelope });
    return { catchup, envelope };
  }

  // ==========================================================================
  // 6. FULL EVENT IN -> STATEFUL CORE -> EVENT OUT PIPELINE
  // ==========================================================================

  /**
   * Unified Pipeline: Ingests an incoming raw transport event, executes state transitions,
   * enforces leases and floor controls, and produces outbound response envelopes.
   */
  public async processEventIn(
    rawEvent: any,
    transportContext: { connectionId?: string; auth?: any } = {}
  ): Promise<{
    outboundEnvelopes: AgentMessageEnvelope[];
    catchup?: ConversationStateCatchup;
    result?: any;
  }> {
    const outboundEnvelopes: AgentMessageEnvelope[] = [];

    // Normalize raw payload into valid envelope
    const envelope: AgentMessageEnvelope = this.router
      ? this.router.ensureEnvelope(rawEvent)
      : createAgentMessageEnvelope({
          conversationId: rawEvent.conversationId || rawEvent.roomUri || 'conv_default',
          conversationType: rawEvent.conversationType || 'forum',
          speechAct: rawEvent.speechAct || 'INFORM',
          sender: rawEvent.sender || { nodeId: this.localNodeId, agentId: 'anonymous' },
          recipients: rawEvent.recipients || '*',
          topic: rawEvent.topic,
          payload: rawEvent.payload ?? rawEvent,
          turn: rawEvent.turn || 1,
          contextState: rawEvent.contextState,
        });

    const validation = validateAgentMessageEnvelope(envelope);
    if (!validation.valid) {
      throw new Error(`Invalid message envelope: ${validation.errors.join(', ')}`);
    }

    const conversationId = envelope.conversationId;

    // Dispatch specialized lifecycle speech acts
    switch (envelope.speechAct) {
      case 'JOIN': {
        const joinRes = await this.joinConversation(
          conversationId,
          envelope.sender,
          {
            connectionId: transportContext.connectionId,
            conversationalRole: envelope.sender.conversationalRole || envelope.sender.role,
            capabilities: envelope.payload?.capabilities,
            leaseDurationMs: envelope.payload?.leaseDurationMs,
            metadata: envelope.payload,
          }
        );
        outboundEnvelopes.push(joinRes.envelope);
        return { outboundEnvelopes, catchup: joinRes.catchup, result: joinRes.session };
      }

      case 'LEAVE': {
        const leaveEnvelope = await this.leaveConversation(
          conversationId,
          envelope.sender.agentId,
          {
            reason: envelope.payload?.reason,
            concede: envelope.payload?.concede,
            graceful: envelope.payload?.graceful,
          }
        );
        outboundEnvelopes.push(leaveEnvelope);
        return { outboundEnvelopes, result: leaveEnvelope };
      }

      case 'HEARTBEAT': {
        const sessId = transportContext.connectionId
          ? this.connectionIndex.get(transportContext.connectionId)
          : envelope.payload?.sessionId;
        if (sessId) {
          this.heartbeat(sessId);
        }
        return { outboundEnvelopes, result: { ack: true } };
      }

      case 'SYNC': {
        const syncRes = await this.syncState(conversationId, envelope.sender.agentId);
        outboundEnvelopes.push(syncRes.envelope);
        return { outboundEnvelopes, catchup: syncRes.catchup };
      }

      default: {
        // Standard conversational speech act (INFORM, PROPOSE, QUERY, VOTE, etc.)
        this.recordEnvelope(conversationId, envelope);

        // Update context state
        if (envelope.contextState) {
          const current = this.contextStateMap.get(conversationId) || {};
          this.contextStateMap.set(conversationId, { ...current, ...envelope.contextState });
        }

        // If forum voting act, register vote in quorum
        if (envelope.speechAct === 'VOTE' && envelope.payload?.vote) {
          const conv = this.conversations.get(conversationId);
          if (conv?.quorum) {
            conv.quorum.tally[envelope.sender.agentId] = envelope.payload.vote;
            if (Object.keys(conv.quorum.tally).length >= conv.quorum.requiredVotes) {
              conv.quorum.concluded = true;
              this.emit('quorum:concluded', { conversationId, tally: conv.quorum.tally });
            }
          }
        }

        // Route outbound via router
        if (this.router) {
          await this.router.routeOutbound(envelope);
        }

        outboundEnvelopes.push(envelope);
        return { outboundEnvelopes, result: envelope };
      }
    }
  }

  // ==========================================================================
  // 7. EPHEMERAL CAPABILITY LEASE MANAGEMENT
  // ==========================================================================

  /**
   * Grants time-bounded capability leases to a session.
   */
  public grantEphemeralLease(sessionId: string, capabilities: string[], durationMs: number = 60000): string[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const now = Date.now();
    const leaseIds: string[] = [];

    for (const cap of capabilities) {
      const leaseId = `lease_${cap}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const record: EphemeralLeaseRecord = {
        leaseId,
        sessionId,
        agentId: session.participant.agentId,
        capabilities: [cap],
        expiresAt: now + durationMs,
      };
      this.activeLeases.set(leaseId, record);
      leaseIds.push(leaseId);
    }

    session.activeLeases = [...(session.activeLeases || []), ...leaseIds];
    this.emit('lease:granted', { sessionId, leaseIds, capabilities, durationMs });
    return leaseIds;
  }

  /**
   * Checks whether a session has an active, unexpired capability lease.
   */
  public hasCapabilityLease(sessionId: string, capability: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.activeLeases) return false;

    const now = Date.now();
    return session.activeLeases.some(lid => {
      const rec = this.activeLeases.get(lid);
      return rec && rec.capabilities.includes(capability) && rec.expiresAt > now;
    });
  }

  /**
   * Revokes all active leases for a session.
   */
  public revokeEphemeralLeases(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.activeLeases) return;

    for (const lid of session.activeLeases) {
      this.activeLeases.delete(lid);
    }
    session.activeLeases = [];
    this.emit('lease:revoked', { sessionId });
  }

  // ==========================================================================
  // 8. QUERY & HELPER METHODS
  // ==========================================================================

  public getSession(sessionId: string): ConversationSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getSessionsForConversation(conversationId: string): ConversationSession[] {
    const results: ConversationSession[] = [];
    for (const [, s] of this.sessions) {
      if (s.conversationId === conversationId && s.status !== 'disconnected') {
        results.push(s);
      }
    }
    return results;
  }

  public getActiveSessions(): ConversationSession[] {
    const results: ConversationSession[] = [];
    for (const [, s] of this.sessions) {
      if (s.status === 'connected') {
        results.push(s);
      }
    }
    return results;
  }

  private releaseFloorIfActiveSpeaker(conversationId: string, agentId: string): void {
    const conv = this.conversations.get(conversationId);
    if (conv?.governance?.activeSpeaker) {
      const active = conv.governance.activeSpeaker;
      if (active === agentId || active.endsWith(`:${agentId}`)) {
        conv.governance.activeSpeaker = undefined;
        this.emit('floor:released', { conversationId, previousSpeaker: agentId });
      }
    }
  }

  private recordEnvelope(conversationId: string, envelope: AgentMessageEnvelope): void {
    let history = this.turnHistoryMap.get(conversationId);
    if (!history) {
      history = [];
      this.turnHistoryMap.set(conversationId, history);
    }
    history.push(envelope);
    if (history.length > 50) {
      history.shift();
    }
  }
}

