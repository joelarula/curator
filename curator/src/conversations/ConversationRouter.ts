import { EventEmitter } from 'events';
import type {
  AgentMessageEnvelope,
  AgentEndpoint,
} from './types.js';
import { validateAgentMessageEnvelope, createAgentMessageEnvelope } from './EnvelopeValidator.js';
import type { ConversationManager } from './ConversationManager.js';
import type { DialogSession } from './DialogSession.js';
import type { ForumRoom } from './ForumRoom.js';
import type { BroadcastChannel } from './BroadcastChannel.js';
import type { QADispatcher } from './QADispatcher.js';
import { ExposurePolicyController } from './exposure/index.js';
import { ConversationSessionManager } from './ConversationSessionManager.js';
import type {
  StartConversationOptions,
  ConversationJoinOptions,
  ConversationLeaveOptions,
  ConversationStateCatchup,
  ConversationSession,
} from './types.js';

export interface ConversationRouterOptions {
  localNodeId?: string;
  localProjectId?: string;
  manager?: ConversationManager;
  prisma?: any;
  exposure?: ExposurePolicyController;
  sendRemote?: (targetNodeId: string, eventName: string, payload: any) => Promise<void>;
  broadcastRemote?: (eventName: string, payload: any) => Promise<void>;
}

export type ConversationalSession = DialogSession | ForumRoom | BroadcastChannel | QADispatcher;

/**
 * Central router for agentic communication.
 * Operates natively within a single node (local loopback, intra-node cross-project),
 * and seamlessly federates across the peer mesh when network transports are attached.
 */
export class ConversationRouter extends EventEmitter {
  public readonly localNodeId: string;
  public readonly localProjectId: string;
  public readonly exposure: ExposurePolicyController;
  public readonly sessionManager: ConversationSessionManager;

  private manager?: ConversationManager;
  private prisma?: any;
  private sendRemoteFn?: (targetNodeId: string, eventName: string, payload: any) => Promise<void>;
  private broadcastRemoteFn?: (eventName: string, payload: any) => Promise<void>;

  private sessions: Map<string, ConversationalSession> = new Map();
  private localAgentHandlers: Map<string, (envelope: AgentMessageEnvelope) => Promise<void> | void> = new Map();

  constructor(options: ConversationRouterOptions = {}) {
    super();
    this.localNodeId = options.localNodeId || 'local';
    this.localProjectId = options.localProjectId || '1';
    this.manager = options.manager;
    this.prisma = options.prisma;
    this.exposure = options.exposure || new ExposurePolicyController();
    this.exposure.on('exposure_changed', (evt) => this.emit('exposure_changed', evt));
    this.sendRemoteFn = options.sendRemote;
    this.broadcastRemoteFn = options.broadcastRemote;

    this.sessionManager = new ConversationSessionManager({
      localNodeId: this.localNodeId,
      localProjectId: this.localProjectId,
      router: this,
      manager: this.manager,
      prisma: this.prisma,
    });
    this.sessionManager.on('conversation:joined', (evt) => this.emit('conversation:joined', evt));
    this.sessionManager.on('conversation:left', (evt) => this.emit('conversation:left', evt));
    this.sessionManager.on('session:connected', (evt) => this.emit('session:connected', evt));
    this.sessionManager.on('session:timeout', (evt) => this.emit('session:timeout', evt));
    this.sessionManager.on('floor:released', (evt) => this.emit('floor:released', evt));
  }

  /**
   * Sets or attaches remote federation mesh transports dynamically.
   */
  public setRemoteTransport(transports: {
    sendRemote?: (targetNodeId: string, eventName: string, payload: any) => Promise<void>;
    broadcastRemote?: (eventName: string, payload: any) => Promise<void>;
  }): void {
    if (transports.sendRemote) this.sendRemoteFn = transports.sendRemote;
    if (transports.broadcastRemote) this.broadcastRemoteFn = transports.broadcastRemote;
  }

  /**
   * Registers an active conversational session (Dialog, Forum, Broadcast, QA).
   */
  public registerSession(session: ConversationalSession): void {
    const convId = 'conversationId' in session ? session.conversationId : (session as any).roomUri;
    if (convId) {
      this.sessions.set(convId, session);
    }
  }

  /**
   * Unregisters a conversational session.
   */
  public unregisterSession(conversationId: string): boolean {
    return this.sessions.delete(conversationId);
  }

  /**
   * Retrieves an active session by conversationId.
   */
  public getSession(conversationId: string): ConversationalSession | undefined {
    return this.sessions.get(conversationId);
  }

  /**
   * Registers a message listener for a local agent or conversational role.
   */
  public registerLocalAgent(agentOrRole: string, handler: (envelope: AgentMessageEnvelope) => Promise<void> | void): void {
    this.localAgentHandlers.set(agentOrRole, handler);
  }

  /**
   * Unregisters a local agent handler.
   */
  public unregisterLocalAgent(agentOrRole: string): boolean {
    return this.localAgentHandlers.delete(agentOrRole);
  }

  /**
   * Evaluates dynamic role resolution: \delta(r_t, g) = { a \in A | r_t \in \tau(a, g) }
   * Resolves physical agent endpoints matching an abstract conversational role.
   * NOTE: Conversational roles (communicative pragmatics) are strictly decoupled
   * from security RBAC permission roles (system access control).
   */
  public async resolveRole(roleName: string, conversationId?: string): Promise<AgentEndpoint[]> {
    // 1. Check room participants if session or conversationId exists
    if (conversationId) {
      const session = this.sessions.get(conversationId);
      if (session && 'participants' in session && Array.isArray((session as any).participants)) {
        const matching = (session as any).participants.filter(
          (p: AgentEndpoint) => p.conversationalRole === roleName || p.role === roleName
        );
        if (matching.length > 0) return matching;
      }

      if (this.prisma?.conversation?.findUnique) {
        try {
          const conv = await this.prisma.conversation.findUnique({ where: { externalId: conversationId } });
          const meta = typeof conv?.metadata === 'string' ? JSON.parse(conv.metadata) : conv?.metadata;
          if (Array.isArray(meta?.participants)) {
            const matching = meta.participants.filter(
              (p: AgentEndpoint) => p.conversationalRole === roleName || p.role === roleName
            );
            if (matching.length > 0) return matching;
          }
        } catch (_) {}
      }
    }

    // 2. Query Prisma database for agents declaring this conversational/discourse role in metadata
    // (Explicitly decoupled from security/RBAC permission roles: e.g. 'critic', 'proposer', 'chair' vs 'admin', 'user')
    if (this.prisma?.agent?.findMany) {
      try {
        const allAgents = await this.prisma.agent.findMany({
          where: { existent: true },
        });
        const matchingAgents = allAgents.filter((a: any) => {
          let meta = a.metadata;
          if (typeof meta === 'string') {
            try { meta = JSON.parse(meta); } catch (_) { meta = {}; }
          }
          const convRoles = meta?.conversationalRoles || meta?.discourseRoles;
          if (Array.isArray(convRoles)) {
            return convRoles.includes(roleName);
          }
          return false;
        });
        if (matchingAgents.length > 0) {
          return matchingAgents.map((a: any) => ({
            nodeId: this.localNodeId,
            projectId: a.projectId,
            agentId: a.id || a.name,
            name: a.name,
            conversationalRole: roleName,
            role: roleName,
          }));
        }
      } catch (_) {}
    }

    // 3. Fallback: check local agent handlers registered with this role
    if (this.localAgentHandlers.has(`@role:${roleName}`) || this.localAgentHandlers.has(roleName)) {
      return [{
        nodeId: this.localNodeId,
        projectId: this.localProjectId,
        agentId: `@role:${roleName}`,
        conversationalRole: roleName,
        role: roleName,
      }];
    }

    return [];
  }

  /**
   * Normalizes a raw event payload or partial script emission into a valid AgentMessageEnvelope.
   */
  public ensureEnvelope(raw: any): AgentMessageEnvelope {
    if (raw && typeof raw === 'object' && raw.messageId && raw.conversationId && raw.sender && raw.recipients) {
      return raw as AgentMessageEnvelope;
    }

    const convId = raw.conversationId || raw.roomUri || `conv_${Date.now()}`;
    const target = raw.target || raw.roomUri || raw.to;
    const targetRole = raw.targetRole || raw.to_role || (typeof target === 'string' && target.startsWith('@role:') ? target.replace('@role:', '') : raw.role);
    const senderRole = raw.senderRole || raw.as_role;

    let recipients: AgentEndpoint[] | '*' = '*';
    if (target === '*' || raw.recipients === '*') {
      recipients = '*';
    } else if (Array.isArray(raw.recipients)) {
      recipients = raw.recipients;
    } else if (target || targetRole) {
      recipients = [{
        nodeId: raw.targetNodeId || 'local',
        agentId: target && !target.startsWith('@role:') ? target : (targetRole ? `@role:${targetRole}` : 'target_agent'),
        conversationalRole: targetRole,
        role: targetRole,
      }];
    }

    return createAgentMessageEnvelope({
      conversationId: convId,
      conversationType: raw.conversationType || (raw.roomUri ? 'forum' : 'dialog'),
      communicationForm: raw.communicationForm,
      turnDynamics: raw.turnDynamics,
      intent: raw.intent,
      speechAct: raw.speechAct || 'INFORM',
      sender: {
        nodeId: raw.senderNodeId || this.localNodeId,
        agentId: raw.senderAgentId || 'local_agent',
        conversationalRole: senderRole,
        role: senderRole,
      },
      recipients,
      topic: raw.topic || raw.title,
      summary: raw.summary,
      payload: raw.payload ?? raw,
      turn: typeof raw.turn === 'number' && raw.turn >= 1 ? raw.turn : 1,
      contextState: raw.contextState,
    });
  }

  /**
   * Routes an outbound envelope according to its recipients.
   * Works seamlessly for local loopback, intra-node cross-project, and mesh forwarding.
   */
  public async routeOutbound(rawEnvelope: any): Promise<void> {
    const envelope = this.ensureEnvelope(rawEnvelope);
    const validation = validateAgentMessageEnvelope(envelope);
    if (!validation.valid) {
      throw new Error(`Invalid agent message envelope: ${validation.errors.join(', ')}`);
    }

    // Persist to database if manager is configured
    if (this.manager) {
      try {
        const room = await this.manager.findOrCreateRoom(envelope);
        await this.manager.recordTurn(room, envelope);
      } catch (err) {
        this.emit('warn', `Failed to persist outbound turn: ${err}`);
      }
    }

    // 1. Broadcast / Monolog: dispatch locally and forward to mesh
    if (envelope.recipients === '*') {
      this.dispatchLocal(envelope);
      if (this.broadcastRemoteFn) {
        await this.broadcastRemoteFn('agent:message', envelope);
      }
      return;
    }

    // 2. Direct or Multicast addressing with dynamic conversational role expansion
    const targetEndpoints: AgentEndpoint[] = [];
    for (const recipient of envelope.recipients) {
      const targetRole = recipient.conversationalRole || recipient.role;
      const isRoleTarget = targetRole && (!recipient.agentId || recipient.agentId.startsWith('@role:') || recipient.agentId.startsWith('role:') || recipient.agentId === '*');
      if (isRoleTarget) {
        const matching = await this.resolveRole(targetRole, envelope.conversationId);
        if (matching.length > 0) {
          targetEndpoints.push(...matching);
        } else {
          targetEndpoints.push(recipient);
        }
      } else {
        targetEndpoints.push(recipient);
      }
    }

    for (const recipient of targetEndpoints) {
      if (this.isLocalEndpoint(recipient)) {
        // Local loopback or intra-node cross-project
        this.dispatchLocal(envelope, recipient);
      } else {
        // Remote peer node
        if (this.sendRemoteFn) {
          await this.sendRemoteFn(recipient.nodeId, 'agent:message', envelope);
        } else {
          this.emit('warn', `No remote transport configured to send to node '${recipient.nodeId}'`);
        }
      }
    }
  }

  /**
   * Ingests and routes an inbound envelope.
   */
  public async routeInbound(rawEnvelope: any): Promise<void> {
    const envelope = this.ensureEnvelope(rawEnvelope);
    const validation = validateAgentMessageEnvelope(envelope);
    if (!validation.valid) {
      this.emit('warn', `Rejected invalid inbound envelope: ${validation.errors.join(', ')}`);
      return;
    }

    // Persist to database
    if (this.manager) {
      try {
        const room = await this.manager.findOrCreateRoom(envelope);
        await this.manager.recordTurn(room, envelope);
      } catch (err) {
        this.emit('warn', `Failed to persist inbound turn: ${err}`);
      }
    }

    // Inform session manager of lifecycle speech acts
    if (['JOIN', 'LEAVE', 'HEARTBEAT', 'SYNC'].includes(envelope.speechAct)) {
      try {
        await this.sessionManager.processEventIn(envelope);
      } catch (err) {
        this.emit('warn', `SessionManager failed to process ${envelope.speechAct}: ${err}`);
      }
    }

    // Deliver to registered session if matching
    const session = this.sessions.get(envelope.conversationId);
    if (session && 'handleIncoming' in session) {
      await (session as any).handleIncoming(envelope);
    }

    // Deliver to targeted local agents
    if (envelope.recipients === '*') {
      this.dispatchLocal(envelope);
    } else {
      for (const r of envelope.recipients) {
        if (this.isLocalEndpoint(r)) {
          this.dispatchLocal(envelope, r);
        }
      }
    }

    this.emit('message', envelope);
  }

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
    return this.sessionManager.processEventIn(rawEvent, transportContext);
  }

  /**
   * Convenience delegate to start a persistent conversation container.
   */
  public async startConversation(options: StartConversationOptions) {
    return this.sessionManager.startConversation(options);
  }

  /**
   * Convenience delegate to join a conversation session.
   */
  public async joinConversation(
    conversationId: string,
    participant: AgentEndpoint,
    options?: ConversationJoinOptions
  ) {
    return this.sessionManager.joinConversation(conversationId, participant, options);
  }

  /**
   * Convenience delegate to leave a conversation session.
   */
  public async leaveConversation(
    conversationId: string,
    agentId: string,
    options?: ConversationLeaveOptions
  ) {
    return this.sessionManager.leaveConversation(conversationId, agentId, options);
  }

  /**
   * Convenience delegate to send a session heartbeat.
   */
  public heartbeat(sessionId: string): boolean {
    return this.sessionManager.heartbeat(sessionId);
  }

  /**
   * Convenience delegate to check for timed-out sessions.
   */
  public checkTimeouts(timeoutMs?: number): ConversationSession[] {
    return this.sessionManager.checkTimeouts(timeoutMs);
  }

  /**
   * Convenience delegate to sync conversation state.
   */
  public async syncState(conversationId: string, targetAgentId?: string) {
    return this.sessionManager.syncState(conversationId, targetAgentId);
  }

  private dispatchLocal(envelope: AgentMessageEnvelope, specificRecipient?: AgentEndpoint): void {
    if (specificRecipient) {
      // 1. Direct agentId match
      const handler = this.localAgentHandlers.get(specificRecipient.agentId);
      if (handler) {
        Promise.resolve(handler(envelope)).catch(err => {
          this.emit('error', `Error in local agent handler '${specificRecipient.agentId}': ${err}`);
        });
        return;
      }

      // 2. Check if any handler is registered by conversational role
      const targetRole = specificRecipient.conversationalRole || specificRecipient.role;
      if (targetRole) {
        const roleHandler = this.localAgentHandlers.get(`@role:${targetRole}`) || this.localAgentHandlers.get(targetRole);
        if (roleHandler) {
          Promise.resolve(roleHandler(envelope)).catch(err => {
            this.emit('error', `Error in local conversational role handler '${targetRole}': ${err}`);
          });
          return;
        }
      }
    } else {
      // Fan-out to all local agents
      for (const [, handler] of this.localAgentHandlers.entries()) {
        Promise.resolve(handler(envelope)).catch(err => {
          this.emit('error', `Error in local broadcast handler: ${err}`);
        });
      }
    }
  }

  private isLocalEndpoint(endpoint: AgentEndpoint): boolean {
    return (
      endpoint.nodeId === 'local' ||
      endpoint.nodeId === this.localNodeId ||
      !endpoint.nodeId
    );
  }
}
