import { EventEmitter } from 'events';
import type { AgentEndpoint, AgentMessageEnvelope } from './types.js';
import type { ConversationManager } from './ConversationManager.js';

export interface BaseConversationSessionOptions {
  conversationId: string;
  topic?: string;
  manager?: ConversationManager;
}

/**
 * Shared base class for conversational topologies (Dialog, Forum, Broadcast, QA).
 * Consolidates turn counting, database persistence via ConversationManager,
 * timer lifecycle management, and endpoint identity helpers.
 */
export abstract class BaseConversationSession extends EventEmitter {
  public readonly conversationId: string;
  public readonly topic?: string;
  protected manager?: ConversationManager;
  protected turnCounter: number = 0;
  private sessionTimer: NodeJS.Timeout | null = null;

  constructor(options: BaseConversationSessionOptions) {
    super();
    this.conversationId = options.conversationId;
    this.topic = options.topic;
    this.manager = options.manager;
  }

  protected async persistTurn(
    envelope: AgentMessageEnvelope,
    stateUpdates?: Record<string, unknown>
  ): Promise<void> {
    if (!this.manager) return;
    try {
      const room = await this.manager.findOrCreateRoom(envelope);
      await this.manager.recordTurn(room, envelope);
      if (stateUpdates && room?.id !== undefined) {
        await this.manager.syncContextState(room.id, stateUpdates);
      }
    } catch (err) {
      this.emit('warn', `Failed to persist turn for '${this.conversationId}': ${err}`);
    }
  }

  protected startSessionTimer(timeoutMs: number | undefined, onTimeout: () => void): void {
    this.clearSessionTimer();
    if (!timeoutMs || timeoutMs <= 0) return;
    this.sessionTimer = setTimeout(onTimeout, timeoutMs);
    if (typeof this.sessionTimer.unref === 'function') {
      this.sessionTimer.unref();
    }
  }

  protected clearSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  protected isSameEndpoint(a: AgentEndpoint, b: AgentEndpoint): boolean {
    return a.nodeId === b.nodeId && a.agentId === b.agentId;
  }

  protected endpointKey(ep: AgentEndpoint): string {
    return `${ep.nodeId || 'local'}:${ep.agentId}`;
  }
}
