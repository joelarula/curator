import { EventEmitter } from 'events';
import type {
  AgentMessageEnvelope,
  AgentEndpoint,
  SpeechAct,
  CommunicationForm,
  TurnTakingDynamics,
  CommunicativeIntent,
} from './types.js';
import { createAgentMessageEnvelope } from './EnvelopeValidator.js';
import type { ConversationManager } from './ConversationManager.js';

export type DialogStatus = 'ACTIVE' | 'WAITING' | 'COMPLETED' | 'TIMED_OUT' | 'ERROR';

export interface DialogSessionOptions {
  conversationId: string;
  initiator: AgentEndpoint;
  responder: AgentEndpoint;
  topic?: string;
  maxTurns?: number;
  turnTimeoutMs?: number;
  manager?: ConversationManager;
  onMessage?: (envelope: AgentMessageEnvelope) => Promise<void> | void;
  onComplete?: (session: DialogSession) => void;
}

export interface SendMessageOptions {
  speechAct?: SpeechAct;
  payload: any;
  topic?: string;
  communicationForm?: CommunicationForm;
  turnDynamics?: TurnTakingDynamics;
  intent?: CommunicativeIntent;
  contextState?: Record<string, unknown>;
}

/**
 * Manages a stateful 1:1 bilateral dialog between two agents.
 * Operates seamlessly inside a single node as well as across the mesh.
 * Enforces turn-taking invariants: exactly one agent holds the speaking floor at any time.
 */
export class DialogSession extends EventEmitter {
  public readonly conversationId: string;
  public readonly initiator: AgentEndpoint;
  public readonly responder: AgentEndpoint;
  public readonly topic?: string;
  public readonly maxTurns: number;
  public readonly turnTimeoutMs?: number;

  private currentTurnNumber: number = 0;
  private currentActiveSpeaker: AgentEndpoint;
  private sessionStatus: DialogStatus = 'ACTIVE';
  private history: AgentMessageEnvelope[] = [];
  private manager?: ConversationManager;
  private turnTimer: NodeJS.Timeout | null = null;
  private sharedContext: Record<string, unknown> = {};

  constructor(options: DialogSessionOptions) {
    super();
    this.conversationId = options.conversationId;
    this.initiator = options.initiator;
    this.responder = options.responder;
    this.topic = options.topic;
    this.maxTurns = options.maxTurns || 20;
    this.turnTimeoutMs = options.turnTimeoutMs;
    this.manager = options.manager;
    this.currentActiveSpeaker = options.initiator;

    if (options.onMessage) {
      this.on('message', options.onMessage);
    }
    if (options.onComplete) {
      this.on('complete', options.onComplete);
    }
  }

  public get status(): DialogStatus {
    return this.sessionStatus;
  }

  public get currentTurn(): number {
    return this.currentTurnNumber;
  }

  public get activeSpeaker(): AgentEndpoint {
    return this.currentActiveSpeaker;
  }

  public get context(): Record<string, unknown> {
    return { ...this.sharedContext };
  }

  public get messageHistory(): ReadonlyArray<AgentMessageEnvelope> {
    return this.history;
  }

  /**
   * Sends a message turn from the active speaker.
   */
  public async sendTurn(sender: AgentEndpoint, options: SendMessageOptions): Promise<AgentMessageEnvelope> {
    if (this.sessionStatus === 'COMPLETED' || this.sessionStatus === 'TIMED_OUT') {
      throw new Error(`Cannot send turn: Dialog '${this.conversationId}' is ${this.sessionStatus}`);
    }

    // Validate that sender matches active speaker
    if (this.currentTurnNumber > 0 && !this.isSameEndpoint(sender, this.currentActiveSpeaker)) {
      throw new Error(
        `Turn order violation: '${sender.nodeId}:${sender.agentId}' is not the active speaker. Waiting for '${this.currentActiveSpeaker.nodeId}:${this.currentActiveSpeaker.agentId}'`
      );
    }

    const nextRecipient = this.isSameEndpoint(sender, this.initiator) ? this.responder : this.initiator;
    const nextTurn = this.currentTurnNumber + 1;

    // Merge context updates
    if (options.contextState) {
      this.sharedContext = { ...this.sharedContext, ...options.contextState };
    }

    const parentMessageId = this.history.length > 0
      ? this.history[this.history.length - 1].messageId
      : undefined;

    const envelope = createAgentMessageEnvelope({
      conversationId: this.conversationId,
      conversationType: 'dialog',
      communicationForm: options.communicationForm || 'dialogue',
      turnDynamics: options.turnDynamics || 'alternating',
      intent: options.intent || 'deliberative',
      speechAct: options.speechAct || (nextTurn === 1 ? 'REQUEST' : 'INFORM'),
      sender,
      recipients: [nextRecipient],
      topic: options.topic || this.topic,
      turn: nextTurn,
      parentMessageId,
      contextState: this.sharedContext,
      payload: options.payload,
      expiresInMs: this.turnTimeoutMs,
    });

    this.currentTurnNumber = nextTurn;
    this.history.push(envelope);

    // Switch active speaker token to recipient
    this.currentActiveSpeaker = nextRecipient;

    // Database persistence if manager is configured
    if (this.manager) {
      try {
        const room = await this.manager.findOrCreateRoom(envelope);
        await this.manager.recordTurn(room, envelope);
        await this.manager.syncContextState(room.id, this.sharedContext);
      } catch (err) {
        this.emit('warn', `Failed to persist turn to database: ${err}`);
      }
    }

    this.resetTurnTimer();

    // Check completion criteria
    if (envelope.speechAct === 'ACCEPT' || (envelope.payload && envelope.payload.status === 'completed')) {
      this.complete('Conversation completed naturally');
    } else if (this.currentTurnNumber >= this.maxTurns) {
      this.complete(`Reached maximum turns limit (${this.maxTurns})`);
    }

    this.emit('message', envelope);
    return envelope;
  }

  /**
   * Processes an incoming envelope from a peer.
   */
  public async handleIncoming(envelope: AgentMessageEnvelope): Promise<void> {
    if (envelope.conversationId !== this.conversationId) {
      return;
    }

    if (this.sessionStatus === 'COMPLETED' || this.sessionStatus === 'TIMED_OUT') {
      return;
    }

    // Validate turn progression
    if (envelope.turn !== this.currentTurnNumber + 1) {
      this.emit('warn', `Unexpected turn sequence. Expected ${this.currentTurnNumber + 1}, got ${envelope.turn}`);
    }

    this.currentTurnNumber = envelope.turn;
    this.history.push(envelope);

    if (envelope.contextState) {
      this.sharedContext = { ...this.sharedContext, ...envelope.contextState };
    }

    // Switch active speaker to the other party
    this.currentActiveSpeaker = this.isSameEndpoint(envelope.sender, this.initiator)
      ? this.responder
      : this.initiator;

    if (this.manager) {
      try {
        const room = await this.manager.findOrCreateRoom(envelope);
        await this.manager.recordTurn(room, envelope);
        await this.manager.syncContextState(room.id, this.sharedContext);
      } catch (err) {
        this.emit('warn', `Failed to persist incoming turn: ${err}`);
      }
    }

    this.resetTurnTimer();

    // Check completion signals
    if (envelope.speechAct === 'ACCEPT' || (envelope.payload && envelope.payload.status === 'completed')) {
      this.complete('Conversation accepted / completed');
    } else if (this.currentTurnNumber >= this.maxTurns) {
      this.complete(`Reached maximum turns limit (${this.maxTurns})`);
    }

    this.emit('message', envelope);
  }

  /**
   * Marks the dialog session as completed and cancels any turn timer.
   */
  public complete(reason?: string): void {
    if (this.sessionStatus === 'COMPLETED') return;
    this.clearTurnTimer();
    this.sessionStatus = 'COMPLETED';
    this.emit('complete', { session: this, reason });
  }

  private resetTurnTimer(): void {
    this.clearTurnTimer();
    if (!this.turnTimeoutMs || this.sessionStatus === 'COMPLETED') return;

    this.turnTimer = setTimeout(() => {
      this.sessionStatus = 'TIMED_OUT';
      this.emit('timeout', {
        conversationId: this.conversationId,
        waitingFor: this.currentActiveSpeaker,
        turn: this.currentTurnNumber,
      });
    }, this.turnTimeoutMs);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  private isSameEndpoint(a: AgentEndpoint, b: AgentEndpoint): boolean {
    return a.nodeId === b.nodeId && a.agentId === b.agentId;
  }
}
