import type {
  IStorageAdapter,
  RequestRepository,
  ResponseRepository,
  EventRepository,
  StorageScope,
  StoredRequest,
  StoredResponse,
  StoredEvent,
  NewRequest,
} from './IStorageAdapter.js';
import { assertWritableProject, scopeProjectIds } from './IStorageAdapter.js';
import { TERMINAL_STATUSES } from '../engine/DeadLetters.js';

/** The rows behind a memory store, shared by its scoped views. */
class MemoryRows {
  readonly requests = new Map<number, StoredRequest>();
  readonly responses = new Map<number, StoredResponse>();
  readonly events: StoredEvent[] = [];
  /** conversationId -> projectId, learned from requests, for scoping events. */
  readonly conversations = new Map<number, string | null>();
  nextRequestId = 1;
  nextResponseId = 1;
  nextEventId = 1;
}

/**
 * In-process store for ephemeral runs: nothing survives the process and nothing is shared with other nodes.
 * Claims are atomic because each operation runs without awaiting between its read and its write.
 * Records are copied in and out, so callers can never mutate stored state by reference.
 */
export class MemoryStorageAdapter implements IStorageAdapter {
  public readonly dialect = 'memory';
  public readonly capabilities = { durable: false, shared: false };

  constructor(
    public readonly scope?: StorageScope,
    private readonly clock: () => number = Date.now,
    private readonly db: MemoryRows = new MemoryRows()
  ) {}

  public withScope(scope: StorageScope): MemoryStorageAdapter {
    return new MemoryStorageAdapter(scope, this.clock, this.db);
  }

  /** Records a conversation's project so its events can be scoped before any request exists in it. */
  public registerConversation(conversationId: number, projectId: string | null): void {
    this.db.conversations.set(conversationId, projectId);
  }

  public async close(): Promise<void> {
    this.db.requests.clear();
    this.db.responses.clear();
    this.db.events.length = 0;
    this.db.conversations.clear();
  }

  private visible(projectId: string | null): boolean {
    return !this.scope || projectId == null || scopeProjectIds(this.scope).includes(projectId);
  }

  private visibleConversation(conversationId: number): boolean {
    return !this.scope || (this.db.conversations.has(conversationId) && this.visible(this.db.conversations.get(conversationId)!));
  }

  private row(id: number): StoredRequest | undefined {
    const row = this.db.requests.get(id);
    return row && this.visible(row.projectId) ? row : undefined;
  }

  public requests: RequestRepository = {
    create: async (input: NewRequest) => {
      assertWritableProject(this.scope, input.projectId);
      const now = new Date(this.clock());
      const row: StoredRequest = {
        id: this.db.nextRequestId++,
        status: input.status ?? 'NEW',
        userId: input.userId,
        projectId: input.projectId ?? null,
        conversationId: input.conversationId,
        agentId: input.agentId ?? null,
        scriptId: input.scriptId ?? null,
        scriptVersion: input.scriptVersion ?? null,
        toolName: input.toolName ?? null,
        ast: input.ast ?? null,
        context: input.context ?? null,
        priority: input.priority ?? 0,
        notifyId: input.notifyId ?? null,
        parentId: input.parentId ?? null,
        pendingDependencies: input.pendingDependencies ?? 0,
        retryCount: 0,
        eventCursor: null,
        scheduledAt: input.scheduledAt ?? now,
        lockedBy: null,
        lockedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.db.requests.set(row.id, structuredClone(row));
      if (!this.db.conversations.has(row.conversationId)) this.db.conversations.set(row.conversationId, row.projectId);
      return row;
    },

    get: async (id) => {
      const row = this.row(id);
      return row ? structuredClone(row) : null;
    },

    claim: async (workerId, { limit, now = new Date(this.clock()), conversationIds }) => {
      const inConversation = conversationIds ? new Set(conversationIds) : undefined;
      const runnable = [...this.db.requests.values()]
        .filter(
          r =>
            r.status === 'NEW' &&
            r.pendingDependencies <= 0 &&
            r.scheduledAt != null &&
            r.scheduledAt.getTime() <= now.getTime() &&
            (!inConversation || inConversation.has(r.conversationId)) &&
            this.visible(r.projectId)
        )
        .sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
        .slice(0, Math.max(0, limit));
      const lockedAt = new Date(this.clock());
      for (const r of runnable) Object.assign(r, { status: 'WAITING', lockedBy: workerId, lockedAt, updatedAt: lockedAt });
      return runnable.map(r => structuredClone(r));
    },

    update: async (id, patch) => {
      const row = this.row(id);
      if (!row) throw new Error(`[storage] Request ${id} not found`);
      Object.assign(row, structuredClone(patch), { updatedAt: new Date(this.clock()) });
      return structuredClone(row);
    },

    dependencyDone: async (id) => {
      const row = this.row(id);
      if (!row || TERMINAL_STATUSES.has(row.status)) return null;
      if (row.pendingDependencies <= 0) return structuredClone(row);
      row.pendingDependencies -= 1;
      if (row.pendingDependencies === 0 && (row.status === 'WAITING' || row.status === 'NEW')) {
        Object.assign(row, { status: 'NEW', lockedBy: null, lockedAt: null });
      }
      row.updatedAt = new Date(this.clock());
      return structuredClone(row);
    },

    releaseStale: async (lockedBefore) => {
      let released = 0;
      for (const r of this.db.requests.values()) {
        if (
          r.status === 'WAITING' &&
          r.lockedBy != null &&
          r.lockedAt != null &&
          r.lockedAt.getTime() <= lockedBefore.getTime() &&
          r.pendingDependencies === 0 &&
          this.visible(r.projectId)
        ) {
          Object.assign(r, { status: 'NEW', lockedBy: null, lockedAt: null, updatedAt: new Date(this.clock()) });
          released++;
        }
      }
      return released;
    },
  };

  public responses: ResponseRepository = {
    append: async (input) => {
      assertWritableProject(this.scope, input.projectId);
      const row: StoredResponse = {
        id: this.db.nextResponseId++,
        requestId: input.requestId,
        conversationId: input.conversationId,
        projectId: input.projectId ?? null,
        content: input.content,
        createdAt: new Date(this.clock()),
      };
      this.db.responses.set(row.id, row);
      return { ...row };
    },

    latest: async (requestId) => {
      const rows = await this.responses.listForRequest(requestId);
      return rows[rows.length - 1] ?? null;
    },

    listForRequest: async (requestId) =>
      [...this.db.responses.values()].filter(r => r.requestId === requestId && this.visible(r.projectId)).map(r => ({ ...r })),
  };

  public events: EventRepository = {
    append: async (input) => {
      if (!this.visibleConversation(input.conversationId)) {
        throw new Error(`[storage] Conversation ${input.conversationId} is outside the active scope`);
      }
      const row: StoredEvent = {
        id: this.db.nextEventId++,
        conversationId: input.conversationId,
        eventName: input.eventName,
        payload: structuredClone(input.payload ?? null),
        target: input.target ?? null,
        source: input.source ?? null,
        createdAt: new Date(this.clock()),
      };
      this.db.events.push(row);
      return structuredClone(row);
    },

    after: async (conversationId, afterId, { eventNames, limit } = {}) => {
      if (!this.visibleConversation(conversationId)) return [];
      const names = eventNames ? new Set(eventNames) : undefined;
      const rows = this.db.events.filter(e => e.conversationId === conversationId && e.id > afterId && (!names || names.has(e.eventName)));
      return structuredClone(limit != null ? rows.slice(0, limit) : rows);
    },
  };
}
