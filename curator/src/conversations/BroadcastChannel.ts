import type {
  AgentMessageEnvelope,
  AgentEndpoint,
  CommunicativeIntent,
  CommunicationForm,
} from './types.js';
import { createAgentMessageEnvelope } from './EnvelopeValidator.js';
import { BaseConversationSession } from './BaseConversationSession.js';
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
export class BroadcastChannel extends BaseConversationSession {
  public declare readonly topic: string;
  public readonly sender: AgentEndpoint;
  public readonly maxHops: number;

  private seenMessageIds: Map<string, number> = new Map();
  private dedupTtlMs: number;

  constructor(options: BroadcastChannelOptions) {
    super({
      conversationId: options.conversationId || `broadcast_${options.topic.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      topic: options.topic,
      manager: options.manager,
    });
    this.sender = options.sender;
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
    await this.persistTurn(envelope);
    this.emit('message', envelope);
    return envelope;
  }

  /**
   * Ingests an incoming broadcast message.
   * Drops duplicates or messages with mismatched topics.
   */
  public async handleIncoming(envelope: AgentMessageEnvelope): Promise<boolean> {
    if (this.isDuplicate(envelope.messageId)) {
      return false;
    }
    this.markSeen(envelope.messageId);

    if (envelope.topic && !this.matchesTopic(envelope.topic)) {
      return false;
    }

    await this.persistTurn(envelope);
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
      return incomingTopic.startsWith(this.topic.slice(0, -1));
    }
    return false;
  }

  private isDuplicate(messageId: string): boolean {
    const now = Date.now();
    for (const [id, timestamp] of this.seenMessageIds.entries()) {
      if (now - timestamp > this.dedupTtlMs) {
        this.seenMessageIds.delete(id);
      }
    }
    return this.seenMessageIds.has(messageId);
  }

  private markSeen(messageId: string): void {
    this.seenMessageIds.set(messageId, Date.now());
  }
}
