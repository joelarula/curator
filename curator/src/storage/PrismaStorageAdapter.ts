import type {
  IStorageAdapter,
  RequestRepository,
  ResponseRepository,
  EventRepository,
  StorageScope,
  StoredRequest,
  StoredResponse,
  StoredEvent,
  ClaimOptions,
} from './IStorageAdapter.js';
import { assertWritableProject, scopeProjectIds } from './IStorageAdapter.js';
import { buildProjectScopeWhere } from '../services/ProjectScopeService.js';
import { TERMINAL_STATUSES } from '../engine/DeadLetters.js';
import { sqlDialect, sqlTag, sqlPart, SQL_EMPTY, type SqlDialect, type SqlTag } from '../db/sqlDialect.js';
import { DbNull } from '@prisma/client-runtime-utils';

const CLAIM_ORDER = [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] as const;
/** Prisma's code for a write conflict or deadlock (Galera certification failures surface as deadlocks). */
const WRITE_CONFLICT = 'P2034';
const CLAIM_ATTEMPTS = 3;

/** Prisma rejects a plain null for Json columns: omit it on create (the column defaults to NULL), DbNull on update. */
function withJsonNulls<T extends Record<string, unknown>>(data: T, mode: 'create' | 'update'): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const key of ['ast', 'context'] as const) {
    if (out[key] !== null) continue;
    if (mode === 'create') delete out[key];
    else out[key] = DbNull;
  }
  return out;
}

const parseJson = (value: unknown) => {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const toRequest = (r: any): StoredRequest => ({
  id: r.id,
  status: r.status,
  userId: r.userId,
  projectId: r.projectId ?? null,
  conversationId: r.conversationId,
  agentId: r.agentId ?? null,
  scriptId: r.scriptId ?? null,
  scriptVersion: r.scriptVersion ?? null,
  toolName: r.toolName ?? null,
  ast: parseJson(r.ast),
  context: parseJson(r.context) as StoredRequest['context'],
  priority: r.priority,
  notifyId: r.notifyId ?? null,
  parentId: r.parentId ?? null,
  pendingDependencies: r.pendingDependencies,
  retryCount: r.retryCount,
  eventCursor: r.eventCursor ?? null,
  scheduledAt: r.scheduledAt ?? null,
  lockedBy: r.lockedBy ?? null,
  lockedAt: r.lockedAt ?? null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const toResponse = (r: any): StoredResponse => ({
  id: r.id,
  requestId: r.requestId,
  conversationId: r.conversationId,
  projectId: r.projectId ?? null,
  content: r.content,
  createdAt: r.createdAt,
});

const toEvent = (e: any): StoredEvent => ({
  id: e.id,
  conversationId: e.conversationId,
  eventName: e.eventName,
  payload: parseJson(e.payload),
  target: e.target ?? null,
  source: e.source ?? null,
  createdAt: e.createdAt,
});

/**
 * Store over a curator Prisma client (SQLite, MariaDB/MySQL or Postgres; plain or `$extends`-ed). The client
 * belongs to the caller: `close()` does not disconnect it.
 *
 * Claims: one `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING` on Postgres; `SELECT … FOR
 * UPDATE SKIP LOCKED` plus `UPDATE` in one transaction on MariaDB/MySQL (retried on write conflicts, which is how
 * Galera reports two nodes claiming the same row); a conditional update per row on SQLite (a single writer).
 */
export class PrismaStorageAdapter implements IStorageAdapter {
  public readonly dialect: SqlDialect;
  public readonly capabilities: { durable: boolean; shared: boolean };
  public readonly scope?: StorageScope;
  private readonly sql: SqlTag;
  private readonly clock: () => number;

  constructor(private readonly prisma: any, options: { scope?: StorageScope; clock?: () => number } = {}) {
    this.dialect = sqlDialect(prisma);
    this.sql = sqlTag(this.dialect);
    this.scope = options.scope;
    this.clock = options.clock ?? Date.now;
    this.capabilities = { durable: true, shared: this.dialect !== 'sqlite' };
  }

  public withScope(scope: StorageScope): PrismaStorageAdapter {
    return new PrismaStorageAdapter(this.prisma, { scope, clock: this.clock });
  }

  public async close(): Promise<void> {}

  /** Prisma filter limiting rows to those the scope may read. */
  private scoped(where: Record<string, unknown>): Record<string, unknown> {
    return this.scope ? { AND: [where, buildProjectScopeWhere([...this.scope.projectIds])] } : where;
  }

  private async conversationVisible(conversationId: number): Promise<boolean> {
    if (!this.scope) return true;
    const conv = await this.prisma.conversation.findFirst({
      where: this.scoped({ id: conversationId }),
      select: { id: true },
    });
    return conv != null;
  }

  private async claimIds(workerId: string, limit: number, now: Date, conversationIds?: readonly number[]): Promise<number[]> {
    const lockedAt = new Date(this.clock());
    if (this.dialect === 'sqlite') {
      const candidates = await this.prisma.request.findMany({
        where: this.scoped({
          status: 'NEW',
          pendingDependencies: { lte: 0 },
          scheduledAt: { lte: now },
          ...(conversationIds ? { conversationId: { in: [...conversationIds] } } : {}),
        }),
        orderBy: CLAIM_ORDER,
        take: limit,
        select: { id: true },
      });
      const claimed: number[] = [];
      for (const { id } of candidates) {
        const updated = await this.prisma.request.updateMany({
          where: { id, status: 'NEW' },
          data: { status: 'WAITING', lockedBy: workerId, lockedAt },
        });
        if (updated.count > 0) claimed.push(id);
      }
      return claimed;
    }

    const runnable = sqlPart`
      SELECT "id" FROM "Request"
      WHERE "status" = 'NEW' AND "pendingDependencies" <= 0 AND "scheduledAt" <= ${now}
      ${conversationIds ? sqlPart`AND "conversationId" IN (${[...conversationIds]})` : SQL_EMPTY}
      ${this.scope ? sqlPart`AND ("projectId" IN (${scopeProjectIds(this.scope)}) OR "projectId" IS NULL)` : SQL_EMPTY}
      ORDER BY "priority" DESC, "createdAt" ASC, "id" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`;

    if (this.dialect === 'postgresql') {
      const rows: Array<{ id: unknown }> = await this.prisma.$queryRawUnsafe(
        ...this.sql`UPDATE "Request" SET "status" = 'WAITING', "lockedBy" = ${workerId}, "lockedAt" = ${lockedAt}, "updatedAt" = ${lockedAt}
          WHERE "id" IN (${runnable}) RETURNING "id"`
      );
      return rows.map(r => Number(r.id));
    }

    // MySQL/MariaDB: no UPDATE … RETURNING, and no LIMIT inside an IN subquery
    return this.prisma.$transaction(async (tx: any) => {
      const rows: Array<{ id: unknown }> = await tx.$queryRawUnsafe(...this.sql`${runnable}`);
      const ids = rows.map(r => Number(r.id));
      if (ids.length) {
        await tx.request.updateMany({ where: { id: { in: ids } }, data: { status: 'WAITING', lockedBy: workerId, lockedAt } });
      }
      return ids;
    });
  }

  public requests: RequestRepository = {
    create: async input => {
      assertWritableProject(this.scope, input.projectId);
      const { scheduledAt, ...data } = input;
      const row = await this.prisma.request.create({ data: withJsonNulls(scheduledAt ? { ...data, scheduledAt } : data, 'create') });
      return toRequest(row);
    },

    get: async id => {
      const row = await this.prisma.request.findFirst({ where: this.scoped({ id }) });
      return row ? toRequest(row) : null;
    },

    claim: async (workerId, { limit, now = new Date(this.clock()), conversationIds }: ClaimOptions) => {
      if (limit <= 0 || conversationIds?.length === 0) return [];
      for (let attempt = 1; ; attempt++) {
        try {
          const ids = await this.claimIds(workerId, limit, now, conversationIds);
          if (!ids.length) return [];
          const rows = await this.prisma.request.findMany({ where: { id: { in: ids } }, orderBy: CLAIM_ORDER });
          return rows.map(toRequest);
        } catch (err: any) {
          if (err?.code !== WRITE_CONFLICT || attempt >= CLAIM_ATTEMPTS) throw err;
        }
      }
    },

    update: async (id, patch) => {
      const row = await this.prisma.request.update({ where: this.scoped({ id }), data: withJsonNulls(patch, 'update') });
      return toRequest(row);
    },

    dependencyDone: async id =>
      this.prisma.$transaction(async (tx: any) => {
        const decremented = await tx.request.updateMany({
          where: this.scoped({ id, status: { notIn: [...TERMINAL_STATUSES] }, pendingDependencies: { gt: 0 } }),
          data: { pendingDependencies: { decrement: 1 } },
        });
        if (decremented.count > 0) {
          await tx.request.updateMany({
            where: { id, pendingDependencies: { lte: 0 }, status: { in: ['WAITING', 'NEW'] } },
            data: { status: 'NEW', lockedBy: null, lockedAt: null },
          });
        }
        const row = await tx.request.findFirst({ where: this.scoped({ id }) });
        return row && !TERMINAL_STATUSES.has(row.status) ? toRequest(row) : null;
      }),

    releaseStale: async lockedBefore => {
      const released = await this.prisma.request.updateMany({
        where: this.scoped({ status: 'WAITING', lockedBy: { not: null }, lockedAt: { lte: lockedBefore }, pendingDependencies: 0 }),
        data: { status: 'NEW', lockedBy: null, lockedAt: null },
      });
      return released.count;
    },
  };

  public responses: ResponseRepository = {
    append: async input => {
      assertWritableProject(this.scope, input.projectId);
      return toResponse(await this.prisma.response.create({ data: input }));
    },

    latest: async requestId => {
      const row = await this.prisma.response.findFirst({ where: this.scoped({ requestId }), orderBy: { id: 'desc' } });
      return row ? toResponse(row) : null;
    },

    listForRequest: async requestId => {
      const rows = await this.prisma.response.findMany({ where: this.scoped({ requestId }), orderBy: { id: 'asc' } });
      return rows.map(toResponse);
    },
  };

  public events: EventRepository = {
    append: async input => {
      if (!(await this.conversationVisible(input.conversationId))) {
        throw new Error(`[storage] Conversation ${input.conversationId} is outside the active scope`);
      }
      return toEvent(await this.prisma.eventLog.create({ data: input }));
    },

    after: async (conversationId, afterId, { eventNames, limit } = {}) => {
      if (!(await this.conversationVisible(conversationId))) return [];
      const rows = await this.prisma.eventLog.findMany({
        where: { conversationId, id: { gt: afterId }, ...(eventNames ? { eventName: { in: [...eventNames] } } : {}) },
        orderBy: { id: 'asc' },
        ...(limit != null ? { take: limit } : {}),
      });
      return rows.map(toEvent);
    },
  };
}
