import type {
  AgentMessageEnvelope,
  AgentEndpoint,
  SpeechAct,
  CommunicationForm,
  TurnTakingDynamics,
  CommunicativeIntent,
} from './types.js';
import { createAgentMessageEnvelope } from './EnvelopeValidator.js';
import { BaseConversationSession } from './BaseConversationSession.js';
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
 * Enforces turn-taking invariants: exactly one agent holds the speaking floor at any time.
 */
export class DialogSession extends BaseConversationSession {
  public readonly initiator: AgentEndpoint;
  public readonly responder: AgentEndpoint;
  public readonly maxTurns: number;
  public readonly turnTimeoutMs?: number;

  private currentActiveSpeaker: AgentEndpoint;
  private sessionStatus: DialogStatus = 'ACTIVE';
  private history: AgentMessageEnvelope[] = [];
  private sharedContext: Record<string, unknown> = {};

  constructor(options: DialogSessionOptions) {
    super({
      conversationId: options.conversationId,
      topic: options.topic,
      manager: options.manager,
    });
    this.initiator = options.initiator;
    this.responder = options.responder;
    this.maxTurns = options.maxTurns || 20;
    this.turnTimeoutMs = options.turnTimeoutMs;
    this.currentActiveSpeaker = options.initiator;

    if (options.onMessage) this.on('message', options.onMessage);
    if (options.onComplete) this.on('complete', options.onComplete);
  }

  public get status(): DialogStatus {
    return this.sessionStatus;
  }

  public get currentTurn(): number {
    return this.turnCounter;
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

    if (this.turnCounter > 0 && !this.isSameEndpoint(sender, this.currentActiveSpeaker)) {
      throw new Error(
        `Turn order violation: '${this.endpointKey(sender)}' is not the active speaker. Waiting for '${this.endpointKey(this.currentActiveSpeaker)}'`
      );
    }

    const nextRecipient = this.isSameEndpoint(sender, this.initiator) ? this.responder : this.initiator;
    const nextTurn = this.turnCounter + 1;

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

    await this.applyTurnEnvelope(envelope, nextRecipient);
    return envelope;
  }

  /**
   * Processes an incoming envelope from a peer.
   */
  public async handleIncoming(envelope: AgentMessageEnvelope): Promise<void> {
    if (envelope.conversationId !== this.conversationId) return;
    if (this.sessionStatus === 'COMPLETED' || this.sessionStatus === 'TIMED_OUT') return;

    if (envelope.turn !== this.turnCounter + 1) {
      this.emit('warn', `Unexpected turn sequence. Expected ${this.turnCounter + 1}, got ${envelope.turn}`);
    }

    if (envelope.contextState) {
      this.sharedContext = { ...this.sharedContext, ...envelope.contextState };
    }

    const nextSpeaker = this.isSameEndpoint(envelope.sender, this.initiator)
      ? this.responder
      : this.initiator;

    await this.applyTurnEnvelope(envelope, nextSpeaker);
  }

  /**
   * Marks the dialog session as completed and cancels any turn timer.
   */
  public complete(reason?: string): void {
    if (this.sessionStatus === 'COMPLETED') return;
    this.clearSessionTimer();
    this.sessionStatus = 'COMPLETED';
    this.emit('complete', { session: this, reason });
  }

  private async applyTurnEnvelope(envelope: AgentMessageEnvelope, nextSpeaker: AgentEndpoint): Promise<void> {
    this.turnCounter = envelope.turn;
    this.history.push(envelope);
    this.currentActiveSpeaker = nextSpeaker;

    await this.persistTurn(envelope, this.sharedContext);
    this.resetTurnTimer();

    if (envelope.speechAct === 'ACCEPT' || envelope.payload?.status === 'completed') {
      this.complete('Conversation completed naturally');
    } else if (this.turnCounter >= this.maxTurns) {
      this.complete(`Reached maximum turns limit (${this.maxTurns})`);
    }

    this.emit('message', envelope);
  }

  private resetTurnTimer(): void {
    if (!this.turnTimeoutMs || this.sessionStatus === 'COMPLETED') {
      this.clearSessionTimer();
      return;
    }
    this.startSessionTimer(this.turnTimeoutMs, () => {
      this.sessionStatus = 'TIMED_OUT';
      this.emit('timeout', {
        conversationId: this.conversationId,
        waitingFor: this.currentActiveSpeaker,
        turn: this.turnCounter,
      });
    });
  }
}
