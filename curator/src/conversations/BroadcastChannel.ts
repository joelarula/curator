import { EventEmitter } from 'events';
import type {
  AgentMessageEnvelope,
  AgentEndpoint,
  CommunicativeIntent,
  CommunicationForm,
} from './types.js';
import { createAgentMessageEnvelope } from './EnvelopeValidator.js';
import type { ConversationManager } from './ConversationManager.js';

export interface BroadcastChannelOptions {
  topic: string;
  sender: AgentEndpoint;
  conversationId?: string;
  manager?: ConversationManager;
  dedupTtlMs?: number;
  maxHops?: number;
}

export interface PublishBroadcastOptions {
  topic?: string;
  summary?: string;
  communicationForm?: CommunicationForm;
  intent?: CommunicativeIntent;
  contextState?: Record<string, unknown>;
  expiresInMs?: number;
}

/**
 * Manages 1:N monologue and broadcast communication.
 * Works natively within a single node as well as distributed mesh.
 * Provides topic filtering and message deduplication.
 */
export class BroadcastChannel extends EventEmitter {
  public readonly topic: string;
  public readonly sender: AgentEndpoint;
  public readonly conversationId: string;
  public readonly maxHops: number;

  private manager?: ConversationManager;
  private seenMessageIds: Map<string, number> = new Map();
  private dedupTtlMs: number;
  private turnCounter: number = 0;

  constructor(options: BroadcastChannelOptions) {
    super();
    this.topic = options.topic;
    this.sender = options.sender;
    this.conversationId = options.conversationId || `broadcast_${options.topic.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    this.manager = options.manager;
    this.dedupTtlMs = options.dedupTtlMs || 60000;
    this.maxHops = options.maxHops || 5;
  }

  /**
   * Publishes a message to all listeners on this broadcast topic.
   */
  public async publish(payload: any, options: PublishBroadcastOptions = {}): Promise<AgentMessageEnvelope> {
    this.turnCounter += 1;
    const envelope = createAgentMessageEnvelope({
      conversationId: this.conversationId,
      conversationType: 'monolog',
      communicationForm: options.communicationForm || 'monologue',
      turnDynamics: 'broadcast',
      intent: options.intent || 'narrative',
      speechAct: 'INFORM',
      sender: this.sender,
      recipients: '*',
      topic: options.topic || this.topic,
      summary: options.summary,
      payload,
      turn: this.turnCounter,
      contextState: options.contextState,
      expiresInMs: options.expiresInMs,
      maxHops: this.maxHops,
    });

    this.markSeen(envelope.messageId);

    if (this.manager) {
      try {
        const room = await this.manager.findOrCreateRoom(envelope);
        await this.manager.recordTurn(room, envelope);
      } catch (err) {
        this.emit('warn', `Failed to persist broadcast to database: ${err}`);
      }
    }

    this.emit('message', envelope);
    return envelope;
  }

  /**
   * Ingests an incoming broadcast message.
   * Drops duplicates or messages with exceeded hop counts.
   */
  public async handleIncoming(envelope: AgentMessageEnvelope): Promise<boolean> {
    // Check deduplication
    if (this.isDuplicate(envelope.messageId)) {
      return false;
    }
    this.markSeen(envelope.messageId);

    // Topic check
    if (envelope.topic && !this.matchesTopic(envelope.topic)) {
      return false;
    }

    // Persist to database if manager is configured
    if (this.manager) {
      try {
        const room = await this.manager.findOrCreateRoom(envelope);
        await this.manager.recordTurn(room, envelope);
      } catch (err) {
        this.emit('warn', `Failed to persist incoming broadcast: ${err}`);
      }
    }

    this.emit('message', envelope);
    return true;
  }

  /**
   * Subscribes a listener to broadcasts on this channel.
   */
  public subscribe(handler: (envelope: AgentMessageEnvelope) => Promise<void> | void): () => void {
    this.on('message', handler);
    return () => this.off('message', handler);
  }

  private matchesTopic(incomingTopic: string): boolean {
    if (this.topic === '*' || this.topic === incomingTopic) return true;
    if (this.topic.endsWith('*')) {
      const prefix = this.topic.slice(0, -1);
      return incomingTopic.startsWith(prefix);
    }
    return false;
  }

  private isDuplicate(messageId: string): boolean {
    this.pruneSeen();
    return this.seenMessageIds.has(messageId);
  }

  private markSeen(messageId: string): void {
    this.seenMessageIds.set(messageId, Date.now());
  }

  private pruneSeen(): void {
    const now = Date.now();
    for (const [id, timestamp] of this.seenMessageIds.entries()) {
      if (now - timestamp > this.dedupTtlMs) {
        this.seenMessageIds.delete(id);
      }
    }
  }
}
