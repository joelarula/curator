import { EventEmitter } from 'events';
import { appendStatePatch } from '../engine/ConversationStateLog.js';
import type {
  AgentEndpoint,
  AgentMessageEnvelope,
  ConversationRoomMetadata,
  ConversationSession,
  StartConversationOptions,
  ConversationJoinOptions,
  ConversationLeaveOptions,
  ConversationStateCatchup,
} from './types.js';
import { createAgentMessageEnvelope, validateAgentMessageEnvelope } from './EnvelopeValidator.js';
import {
  createInitialRoomMetadata,
  reduceRoomJoin,
  reduceRoomLeave,
  reduceRoomTurn,
} from './ConversationTools.js';
import { ExposurePolicyController } from './exposure/ExposurePolicyController.js';
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
 * Formalizes the Session (Ephemeral Connection) vs. Conversation (Persistent DB Container) lifecycle.
 * Uses pure deterministic reducers (ConversationTools) for state mutations and delegates
 * capability leases to ExposurePolicyController.
 */
export class ConversationSessionManager extends EventEmitter {
  public readonly localNodeId: string;
  public readonly localProjectId: string;

  private router?: ConversationRouter;
  private manager?: ConversationManager;
  private prisma?: any;
  private fallbackExposure = new ExposurePolicyController();

  private sessions: Map<string, ConversationSession> = new Map();
  private connectionIndex: Map<string, string> = new Map();
  private conversations: Map<string, ConversationRoomMetadata> = new Map();
  private conversationDbIds: Map<string, number> = new Map();
  private contextStateMap: Map<string, Record<string, unknown>> = new Map();
  private turnHistoryMap: Map<string, AgentMessageEnvelope[]> = new Map();

  constructor(options: ConversationSessionManagerOptions = {}) {
    super();
    this.localNodeId = options.localNodeId || 'local';
    this.localProjectId = options.localProjectId || '1';
    this.router = options.router;
    this.manager = options.manager;
    this.prisma = options.prisma;
  }

  private get exposure(): ExposurePolicyController {
    return this.router?.exposure ?? this.fallbackExposure;
  }

  public setRouter(router: ConversationRouter): void {
    this.router = router;
  }

  // ==========================================================================
  // 1. CONVERSATION CONTAINER LIFECYCLE
  // ==========================================================================

  public async startConversation(options: StartConversationOptions): Promise<ConversationRoomMetadata> {
    const conversationId = options.conversationId;
    const metadata = createInitialRoomMetadata(options, this.localNodeId, this.localProjectId);

    this.conversations.set(conversationId, metadata);
    this.contextStateMap.set(conversationId, { ...(metadata.customState || {}) });
    this.turnHistoryMap.set(conversationId, []);

    if (this.prisma?.conversation?.create) {
      try {
        const created = await this.prisma.conversation.create({
          data: {
            externalId: conversationId,
            projectId: options.projectId || this.localProjectId,
            userId: options.userId || '1',
          },
        });
        this.conversationDbIds.set(conversationId, created.id);
        await appendStatePatch(this.prisma, created.id, { set: metadata as Record<string, any> });
      } catch (err) {
        this.emit('warn', `Failed to persist conversation '${conversationId}' to DB: ${err}`);
      }
    }

    this.emit('conversation:started', { conversationId, metadata });
    return metadata;
  }

  public getConversation(conversationId: string): ConversationRoomMetadata | undefined {
    return this.conversations.get(conversationId);
  }

  // ==========================================================================
  // 2. SESSION LIFECYCLE (Connecting & Presence)
  // ==========================================================================

  public connectSession(
    connectionId: string | undefined,
    participant: AgentEndpoint,
    metadata?: Record<string, unknown>,
    conversationId: string = ''
  ): ConversationSession {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    const assignedRole = participant.conversationalRole || participant.role;

    const session: ConversationSession = {
      sessionId,
      conversationId,
      connectionId,
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
      metadata,
    };

    this.sessions.set(sessionId, session);
    if (connectionId) {
      this.connectionIndex.set(connectionId, sessionId);
    }

    this.emit('session:connected', session);
    return session;
  }

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

  public checkTimeouts(timeoutMs: number = 30000): ConversationSession[] {
    const now = Date.now();
    const timedOut: ConversationSession[] = [];

    for (const [, session] of this.sessions) {
      if (session.status === 'connected' || session.status === 'reconnecting') {
        const lastHb = new Date(session.lastHeartbeat).getTime();
        if (now - lastHb >= timeoutMs) {
          session.status = 'timed_out';
          timedOut.push(session);

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
  // 3. JOINING CONVERSATION
  // ==========================================================================

  public async joinConversation(
    conversationId: string,
    participant: AgentEndpoint,
    options: ConversationJoinOptions = {}
  ): Promise<{
    session: ConversationSession;
    catchup: ConversationStateCatchup;
    envelope: AgentMessageEnvelope;
  }> {
    let conversation = this.conversations.get(conversationId);
    if (!conversation) {
      conversation = await this.startConversation({
        conversationId,
        conversationType: 'forum',
        governanceMode: 'moderated',
      });
    }

    const assignedRole = options.conversationalRole || options.as_role || participant.conversationalRole || participant.role;
    const now = new Date().toISOString();

    let session = options.connectionId && this.connectionIndex.has(options.connectionId)
      ? this.sessions.get(this.connectionIndex.get(options.connectionId)!)
      : undefined;

    if (!session) {
      session = this.connectSession(
        options.connectionId,
        {
          ...participant,
          nodeId: participant.nodeId || this.localNodeId,
          conversationalRole: assignedRole,
          role: assignedRole,
        },
        options.metadata,
        conversationId
      );
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

    if (options.capabilities && options.capabilities.length > 0) {
      session.activeLeases = this.grantEphemeralLease(
        session.sessionId,
        options.capabilities,
        options.leaseDurationMs || 60000
      );
    }

    const updatedConversation = reduceRoomJoin(conversation, session.participant);
    this.conversations.set(conversationId, updatedConversation);
    await this.syncConversationPatchToDb(conversationId, updatedConversation);

    const catchup = this.createCatchupSnapshot(conversationId);

    const joinEnvelope = createAgentMessageEnvelope({
      conversationId,
      conversationType: updatedConversation.conversationType,
      communicationForm: updatedConversation.conversationType === 'dialog' ? 'dialogue' : 'polylogue',
      turnDynamics: updatedConversation.governance?.mode === 'round-robin' ? 'alternating' : 'moderated_floor',
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

    if (this.router) {
      await this.router.routeOutbound(joinEnvelope);
    }

    this.emit('conversation:joined', { session, catchup, envelope: joinEnvelope });
    this.emit('session:joined', session);

    return { session, catchup, envelope: joinEnvelope };
  }

  // ==========================================================================
  // 4. LEAVING CONVERSATION
  // ==========================================================================

  public async leaveConversation(
    conversationId: string,
    agentId: string,
    options: ConversationLeaveOptions = {}
  ): Promise<AgentMessageEnvelope> {
    const conversation = this.conversations.get(conversationId);
    const session = this.getSessionsForConversation(conversationId).find(
      (s) => s.participant.agentId === agentId
    );
    const now = new Date().toISOString();

    if (session) {
      this.revokeEphemeralLeases(session.sessionId);
      session.status = 'disconnected';
    }

    if (conversation) {
      const { metadata: updated, floorReleased } = reduceRoomLeave(conversation, agentId, options);
      this.conversations.set(conversationId, updated);
      await this.syncConversationPatchToDb(conversationId, updated);
      if (floorReleased) {
        this.emit('floor:released', { conversationId, previousSpeaker: agentId });
      }
    }

    const updatedConv = this.conversations.get(conversationId);
    const leaveEnvelope = createAgentMessageEnvelope({
      conversationId,
      conversationType: updatedConv?.conversationType || 'forum',
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
      turn: updatedConv?.governance?.currentTurn || 1,
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

  public async processEventIn(
    rawEvent: any,
    transportContext: { connectionId?: string; auth?: any } = {}
  ): Promise<{
    outboundEnvelopes: AgentMessageEnvelope[];
    catchup?: ConversationStateCatchup;
    result?: any;
  }> {
    const outboundEnvelopes: AgentMessageEnvelope[] = [];

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
        this.recordEnvelope(conversationId, envelope);

        if (envelope.contextState) {
          const current = this.contextStateMap.get(conversationId) || {};
          this.contextStateMap.set(conversationId, { ...current, ...envelope.contextState });
        }

        const existingRoom = this.conversations.get(conversationId);
        if (existingRoom) {
          const { metadata: updatedRoom, quorumJustConcluded } = reduceRoomTurn(existingRoom, envelope);
          this.conversations.set(conversationId, updatedRoom);
          await this.syncConversationPatchToDb(conversationId, updatedRoom);
          if (quorumJustConcluded && updatedRoom.quorum) {
            this.emit('quorum:concluded', { conversationId, tally: updatedRoom.quorum.tally });
          }
        }

        if (this.router) {
          await this.router.routeOutbound(envelope);
        }

        outboundEnvelopes.push(envelope);
        return { outboundEnvelopes, result: envelope };
      }
    }
  }

  // ==========================================================================
  // 7. EPHEMERAL CAPABILITY LEASE MANAGEMENT (Delegated to ExposurePolicyController)
  // ==========================================================================

  public grantEphemeralLease(sessionId: string, capabilities: string[], durationMs: number = 60000): string[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const leaseIds: string[] = [];
    for (const cap of capabilities) {
      const lease = this.exposure.grantLease({
        toolName: cap,
        granteePeerId: session.participant.agentId,
        conversationId: session.conversationId || undefined,
        durationMs,
      });
      leaseIds.push(lease.leaseId);
    }

    session.activeLeases = [...(session.activeLeases || []), ...leaseIds];
    this.emit('lease:granted', { sessionId, leaseIds, capabilities, durationMs });
    return leaseIds;
  }

  public hasCapabilityLease(sessionId: string, capability: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.activeLeases?.length) return false;

    const now = Date.now();
    const peerLeases = this.exposure.getActiveLeases(session.participant.agentId);
    return peerLeases.some(
      (l) =>
        session.activeLeases!.includes(l.leaseId) &&
        l.toolName === capability &&
        new Date(l.expiresAt).getTime() > now
    );
  }

  public revokeEphemeralLeases(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.activeLeases) return;

    for (const lid of session.activeLeases) {
      this.exposure.revokeLease(lid, 'session_revocation');
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

  private async syncConversationPatchToDb(
    conversationId: string,
    metadata: ConversationRoomMetadata
  ): Promise<void> {
    const dbId = this.conversationDbIds.get(conversationId);
    if (!dbId || !this.prisma) return;
    try {
      await appendStatePatch(this.prisma, dbId, { set: metadata as Record<string, any> });
    } catch {
      // Non-blocking DB sync
    }
  }
}
