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
  RequestFilter,
  RequestQuery,
} from './IStorageAdapter.js';
import { assertWritableProject, scopeProjectIds } from './IStorageAdapter.js';
import { TERMINAL_STATUSES } from '../engine/DeadLetters.js';

const oneOf = <T>(value: T, wanted: T | readonly T[] | undefined): boolean =>
  wanted === undefined || (Array.isArray(wanted) ? (wanted as readonly T[]).includes(value) : value === wanted);

const ORDERS: Record<NonNullable<RequestQuery['orderBy']>, (a: StoredRequest, b: StoredRequest) => number> = {
  id: (a, b) => a.id - b.id,
  'id desc': (a, b) => b.id - a.id,
  claim: (a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
  updatedAt: (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id - b.id,
  'updatedAt desc': (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id - a.id,
  scheduledAt: (a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0) || a.id - b.id,
};

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

  private matches(r: StoredRequest, f: RequestFilter): boolean {
    return (
      (f.ids === undefined || f.ids.includes(r.id)) &&
      oneOf(r.conversationId, f.conversationId) &&
      oneOf(r.status, f.status) &&
      (f.notifyId === undefined || r.notifyId === f.notifyId) &&
      (f.parentId === undefined || r.parentId === f.parentId) &&
      (f.lockedBy === undefined || r.lockedBy === f.lockedBy) &&
      (f.lockedBefore === undefined || (r.lockedAt != null && r.lockedAt.getTime() <= f.lockedBefore.getTime())) &&
      (f.scheduledAfter === undefined || (r.scheduledAt != null && r.scheduledAt.getTime() > f.scheduledAfter.getTime())) &&
      (f.pendingDependencies === undefined || r.pendingDependencies === f.pendingDependencies) &&
      (f.priorityBelow === undefined || r.priority < f.priorityBelow) &&
      (f.agentId === undefined || (r.agentId != null && f.agentId.includes(r.agentId))) &&
      (f.scriptId === undefined || r.scriptId === f.scriptId) &&
      (f.eventCursorBelow === undefined || r.eventCursor == null || r.eventCursor < f.eventCursorBelow) &&
      (f.hasResponses === undefined || [...this.db.responses.values()].some(x => x.requestId === r.id) === f.hasResponses) &&
      (f.hasOutput === undefined || r.output != null || [...this.db.responses.values()].some(x => x.requestId === r.id)) &&
      (f.any === undefined || f.any.some(sub => this.matches(r, sub)))
    );
  }

  private select(filter: RequestFilter, { orderBy = 'id', take }: RequestQuery = {}): StoredRequest[] {
    const rows = [...this.db.requests.values()].filter(r => this.visible(r.projectId) && this.matches(r, filter)).sort(ORDERS[orderBy]);
    return take != null ? rows.slice(0, take) : rows;
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
        output: null,
        priority: input.priority ?? 0,
        notifyId: input.notifyId ?? null,
        parentId: input.parentId ?? null,
        pendingDependencies: input.pendingDependencies ?? 0,
        retryCount: 0,
        eventCursor: null,
        scheduledAt: input.scheduledAt ?? now,
        lockedBy: input.lockedBy ?? null,
        lockedAt: input.lockedAt ?? null,
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

    find: async (filter, query) => structuredClone(this.select(filter, query)),

    first: async (filter, query) => structuredClone(this.select(filter, { ...query, take: 1 })[0] ?? null),

    count: async filter => this.select(filter).length,

    updateWhere: async (filter, patch) => {
      const rows = this.select(filter);
      const updatedAt = new Date(this.clock());
      for (const r of rows) Object.assign(r, structuredClone(patch), { updatedAt });
      return rows.length;
    },

    delete: async ids => {
      const rows = this.select({ ids });
      for (const r of rows) this.db.requests.delete(r.id);
      for (const [id, res] of this.db.responses) if (ids.includes(res.requestId)) this.db.responses.delete(id);
      return rows.length;
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
        userId: input.userId ?? null,
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

    latestFor: async (requestIds) => {
      const latest = new Map<number, StoredResponse>();
      for (const r of this.db.responses.values()) {
        if (requestIds.includes(r.requestId) && this.visible(r.projectId)) latest.set(r.requestId, { ...r });
      }
      return latest;
    },
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

    after: async (conversationId, afterId, { eventNames, limit, forTarget } = {}) => {
      if (!this.visibleConversation(conversationId)) return [];
      const names = eventNames ? new Set(eventNames) : undefined;
      const rows = this.db.events.filter(
        e =>
          e.conversationId === conversationId &&
          e.id > afterId &&
          (!names || names.has(e.eventName)) &&
          (forTarget === undefined || e.target == null || (forTarget != null && e.target === forTarget))
      );
      return structuredClone(limit != null ? rows.slice(0, limit) : rows);
    },

    latest: async (conversationId, { before } = {}) => {
      if (!this.visibleConversation(conversationId)) return null;
      const rows = this.db.events.filter(e => e.conversationId === conversationId && (!before || e.createdAt.getTime() < before.getTime()));
      return structuredClone(rows[rows.length - 1] ?? null);
    },
  };
}
