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
  RequestFilter,
  RequestQuery,
} from './IStorageAdapter.js';
import { assertWritableProject, scopeProjectIds } from './IStorageAdapter.js';
import { buildProjectScopeWhere } from '../services/ProjectScopeService.js';
import { TERMINAL_STATUSES } from '../engine/DeadLetters.js';
import { sqlDialect, sqlTag, sqlPart, SQL_EMPTY, type SqlDialect, type SqlFragment, type SqlTag } from '../db/sqlDialect.js';
import { DbNull } from '@prisma/client-runtime-utils';

const CLAIM_ORDER = [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] as const;
const ORDERS: Record<NonNullable<RequestQuery['orderBy']>, unknown> = {
  id: { id: 'asc' },
  'id desc': { id: 'desc' },
  claim: CLAIM_ORDER,
  updatedAt: [{ updatedAt: 'asc' }, { id: 'asc' }],
  'updatedAt desc': [{ updatedAt: 'desc' }, { id: 'desc' }],
  scheduledAt: [{ scheduledAt: 'asc' }, { id: 'asc' }],
};
const listOrOne = <T>(v: T | readonly T[]) => (Array.isArray(v) ? { in: [...(v as readonly T[])] } : v);

/** Prisma `where` for a RequestFilter (unscoped). */
function requestWhere(f: RequestFilter): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  const where: Record<string, unknown> = {};
  if (f.ids !== undefined) where.id = { in: [...f.ids] };
  if (f.conversationId !== undefined) where.conversationId = listOrOne(f.conversationId);
  if (f.status !== undefined) where.status = listOrOne(f.status);
  if (f.notifyId !== undefined) where.notifyId = f.notifyId;
  if (f.parentId !== undefined) where.parentId = f.parentId;
  if (f.lockedBy !== undefined) where.lockedBy = f.lockedBy;
  if (f.lockedBefore !== undefined) where.lockedAt = { lte: f.lockedBefore };
  if (f.scheduledAfter !== undefined) where.scheduledAt = { gt: f.scheduledAfter };
  if (f.pendingDependencies !== undefined) where.pendingDependencies = f.pendingDependencies;
  if (f.priorityBelow !== undefined) where.priority = { lt: f.priorityBelow };
  if (f.agentId !== undefined) where.agentId = { in: [...f.agentId] };
  if (f.scriptId !== undefined) where.scriptId = f.scriptId;
  if (f.hasResponses !== undefined) where.responses = f.hasResponses ? { some: {} } : { none: {} };
  if (f.hasOutput) and.push({ OR: [{ output: { not: null } }, { responses: { some: {} } }] });
  if (f.eventCursorBelow !== undefined) and.push({ OR: [{ eventCursor: null }, { eventCursor: { lt: f.eventCursorBelow } }] });
  if (f.any !== undefined) and.push({ OR: f.any.map(requestWhere) });
  return and.length ? { ...where, AND: and } : where;
}
/** Default for `newFlowMaxWaitMs`: how long a new flow's first request yields to running flows' follow-ups. */
export const NEW_FLOW_MAX_WAIT_MS = 10_000;
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
  output: r.output ?? null,
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

const INT_COLUMNS = ['id', 'scriptId', 'scriptVersion', 'aiModelId', 'conversationId', 'priority', 'retryCount', 'notifyId', 'pendingDependencies', 'eventCursor', 'parentId'] as const;

/** A Request row read with raw SQL, shaped like a Prisma row (numbers, parsed Json; MariaDB returns Json as text). */
const rawRequest = (r: any): any => {
  const row = { ...r, ast: parseJson(r.ast), context: parseJson(r.context) };
  for (const key of INT_COLUMNS) if (row[key] != null) row[key] = Number(row[key]);
  if (row.existent != null) row.existent = Boolean(Number(row.existent));
  return row;
};

const byClaimOrder = (a: any, b: any) =>
  b.priority - a.priority || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id;

const toResponse = (r: any): StoredResponse => ({
  id: r.id,
  requestId: r.requestId,
  conversationId: r.conversationId,
  projectId: r.projectId ?? null,
  userId: r.userId ?? null,
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
 *
 * Leases (`leases`, Phase 4): a claim skips conversations another worker holds a live lease on, takes the lease
 * on the conversations it claimed, and puts back what it claimed where another worker won the lease meanwhile.
 * So one worker at a time runs a conversation; the holder renews while it has requests in flight.
 */
export class PrismaStorageAdapter implements IStorageAdapter {
  public readonly dialect: SqlDialect;
  public readonly capabilities: { durable: boolean; shared: boolean };
  public readonly scope?: StorageScope;
  private readonly sql: SqlTag;
  private readonly clock: () => number;
  private readonly leases?: { ttlMs: number };
  /**
   * Leases this store took or renewed: conversation -> owner and expiry (this process's clock). A claim skips
   * re-taking one with more than half its ttl left: until it expires no other worker can take it.
   */
  private readonly held = new Map<number, { owner: string; until: number }>();
  private readonly newFlowMaxWaitMs: number;

  constructor(
    private readonly prisma: any,
    options: { scope?: StorageScope; clock?: () => number; dialect?: SqlDialect; leases?: { ttlMs: number }; newFlowMaxWaitMs?: number } = {}
  ) {
    this.dialect = options.dialect ?? sqlDialect(prisma);
    this.sql = sqlTag(this.dialect);
    this.scope = options.scope;
    this.clock = options.clock ?? Date.now;
    this.leases = options.leases;
    this.newFlowMaxWaitMs = options.newFlowMaxWaitMs ?? NEW_FLOW_MAX_WAIT_MS;
    this.capabilities = { durable: true, shared: this.dialect !== 'sqlite' };
  }

  public withScope(scope: StorageScope): PrismaStorageAdapter {
    return new PrismaStorageAdapter(this.prisma, { scope, clock: this.clock, dialect: this.dialect, leases: this.leases, newFlowMaxWaitMs: this.newFlowMaxWaitMs });
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

  /**
   * Claim order: `priority` first. At equal priority, follow-ups of flows under way go before the first request of
   * a new flow, so a burst of new flows does not hold up the flows already running. A follow-up is a request of a
   * conversation this worker holds the lease of (with leases), or one another request created and points to
   * (`notifyId` / `parentId`; a flow's last step points to neither, hence the lease test). A new flow that has
   * waited `newFlowMaxWaitMs` ranks as a follow-up, so endless loops cannot starve it; then oldest first.
   * `newFlowMaxWaitMs: 0` is plain oldest-first. (SQLite, without leases: the notifyId / parentId test only.)
   */
  private followUpFirst(row: { notifyId?: number | null; parentId?: number | null; createdAt: Date }, cutoff: Date): number {
    return row.notifyId != null || row.parentId != null || new Date(row.createdAt) < cutoff ? 0 : 1;
  }

  /**
   * Claims up to `limit` requests: their ids (SQLite, which reads the rows afterwards) or the claimed rows themselves
   * (Postgres `RETURNING`, MariaDB from the locking select), saving a read per claim.
   */
  private async claimIds(workerId: string, limit: number, now: Date, conversationIds?: readonly number[]): Promise<number[] | any[]> {
    const lockedAt = new Date(this.clock());
    const cutoff = new Date(lockedAt.getTime() - this.newFlowMaxWaitMs);
    if (this.dialect === 'sqlite') {
      const leasedElsewhere = this.leases
        ? (
            await this.prisma.conversationLease.findMany({
              where: { owner: { not: workerId }, leaseUntil: { gt: lockedAt } },
              select: { conversationId: true },
            })
          ).map((l: any) => l.conversationId)
        : [];
      const candidates = await this.prisma.request.findMany({
        where: this.scoped({
          status: 'NEW',
          pendingDependencies: { lte: 0 },
          scheduledAt: { lte: now },
          ...(conversationIds ? { conversationId: { in: [...conversationIds] } } : {}),
          ...(leasedElsewhere.length ? { NOT: { conversationId: { in: leasedElsewhere } } } : {}),
        }),
        orderBy: CLAIM_ORDER,
        // A wider window, ordered follow-ups first below (single writer: no row locks to keep short)
        take: this.newFlowMaxWaitMs > 0 ? Math.max(limit * 10, 100) : limit,
        select: { id: true, priority: true, notifyId: true, parentId: true, createdAt: true },
      });
      if (this.newFlowMaxWaitMs > 0) {
        candidates.sort((a: any, b: any) => b.priority - a.priority || this.followUpFirst(a, cutoff) - this.followUpFirst(b, cutoff));
      }
      const claimed: number[] = [];
      for (const { id } of candidates.slice(0, limit)) {
        const updated = await this.prisma.request.updateMany({
          where: { id, status: 'NEW' },
          data: { status: 'WAITING', lockedBy: workerId, lockedAt },
        });
        if (updated.count > 0) claimed.push(id);
      }
      return claimed;
    }

    const runnable = (columns: SqlFragment) => sqlPart`
      SELECT ${columns} FROM "Request"
      WHERE "status" = 'NEW' AND "pendingDependencies" <= 0 AND "scheduledAt" <= ${now}
      ${conversationIds ? sqlPart`AND "conversationId" IN (${[...conversationIds]})` : SQL_EMPTY}
      ${this.scope ? sqlPart`AND ("projectId" IN (${scopeProjectIds(this.scope)}) OR "projectId" IS NULL)` : SQL_EMPTY}
      ${this.leases ? sqlPart`AND "conversationId" NOT IN (SELECT "conversationId" FROM "ConversationLease" WHERE "owner" <> ${workerId} AND "leaseUntil" > ${lockedAt})` : SQL_EMPTY}
      ORDER BY "priority" DESC,
        ${
          this.newFlowMaxWaitMs > 0
            ? sqlPart`CASE WHEN "notifyId" IS NOT NULL OR "parentId" IS NOT NULL OR "createdAt" < ${cutoff}
                ${this.leases ? sqlPart`OR "conversationId" IN (SELECT "conversationId" FROM "ConversationLease" WHERE "owner" = ${workerId} AND "leaseUntil" > ${lockedAt})` : SQL_EMPTY}
                THEN 0 ELSE 1 END,`
            : SQL_EMPTY
        }
        "createdAt" ASC, "id" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`;

    if (this.dialect === 'postgresql') {
      return this.prisma.$queryRawUnsafe(
        ...this.sql`UPDATE "Request" SET "status" = 'WAITING', "lockedBy" = ${workerId}, "lockedAt" = ${lockedAt}, "updatedAt" = ${lockedAt}
          WHERE "id" IN (${runnable(sqlPart`"id"`)}) RETURNING *`
      );
    }

    // MySQL/MariaDB: no UPDATE … RETURNING, and no LIMIT inside an IN subquery
    return this.prisma.$transaction(async (tx: any) => {
      const rows: any[] = await tx.$queryRawUnsafe(...this.sql`${runnable(sqlPart`*`)}`);
      if (!rows.length) return [];
      await tx.request.updateMany({ where: { id: { in: rows.map(r => Number(r.id)) } }, data: { status: 'WAITING', lockedBy: workerId, lockedAt, updatedAt: lockedAt } });
      return rows.map(r => ({ ...r, status: 'WAITING', lockedBy: workerId, lockedAt, updatedAt: lockedAt }));
    });
  }

  /**
   * Takes or extends this worker's lease on each conversation (free, expired or already its own). Returns the
   * conversations another worker holds.
   */
  private async acquireLeases(workerId: string, conversationIds: readonly number[]): Promise<Set<number>> {
    const lost = new Set<number>();
    const now = new Date(this.clock());
    const leaseUntil = new Date(now.getTime() + this.leases!.ttlMs);
    for (const conversationId of new Set(conversationIds)) {
      const mine = this.held.get(conversationId);
      if (mine?.owner === workerId && mine.until - now.getTime() > this.leases!.ttlMs / 2) continue;
      const taken = await this.prisma.conversationLease.updateMany({
        where: { conversationId, OR: [{ owner: workerId }, { leaseUntil: { lte: now } }] },
        data: { owner: workerId, leaseUntil },
      });
      if (taken.count === 0) {
        try {
          await this.prisma.conversationLease.create({ data: { conversationId, owner: workerId, leaseUntil } });
        } catch (err: any) {
          // Unique violation: another worker created it first
          if (err?.code !== 'P2002') throw err;
          this.held.delete(conversationId);
          lost.add(conversationId);
          continue;
        }
      }
      this.held.set(conversationId, { owner: workerId, until: leaseUntil.getTime() });
    }
    return lost;
  }

  /** Claimed requests as Prisma rows, highest priority first (what the processor executes). */
  public async claimRows(workerId: string, { limit, now = new Date(this.clock()), conversationIds }: ClaimOptions): Promise<any[]> {
    if (limit <= 0 || conversationIds?.length === 0) return [];
    for (let attempt = 1; ; attempt++) {
      try {
        const claimed = await this.claimIds(workerId, limit, now, conversationIds);
        if (!claimed.length) return [];
        const rows = typeof claimed[0] === 'number'
          ? await this.prisma.request.findMany({ where: { id: { in: claimed } }, orderBy: CLAIM_ORDER })
          : claimed.map(rawRequest).sort(byClaimOrder);
        if (!this.leases) return rows;
        const lost = await this.acquireLeases(workerId, rows.map((r: any) => r.conversationId));
        if (!lost.size) return rows;
        // Another worker won the lease between this claim and the lease: its conversation, its requests
        await this.prisma.request.updateMany({
          where: { id: { in: rows.filter((r: any) => lost.has(r.conversationId)).map((r: any) => r.id) }, lockedBy: workerId },
          data: { status: 'NEW', lockedBy: null, lockedAt: null },
        });
        return rows.filter((r: any) => !lost.has(r.conversationId));
      } catch (err: any) {
        if (err?.code !== WRITE_CONFLICT || attempt >= CLAIM_ATTEMPTS) throw err;
      }
    }
  }

  /** Extends this worker's leases on the conversations it still has requests of in flight. */
  public async renewLeases(workerId: string, conversationIds: readonly number[]): Promise<void> {
    if (!this.leases || !conversationIds.length) return;
    const now = this.clock();
    const until = now + this.leases.ttlMs;
    await this.prisma.conversationLease.updateMany({
      where: { owner: workerId, conversationId: { in: [...new Set(conversationIds)] } },
      data: { leaseUntil: new Date(until) },
    });
    // Only a lease still unexpired is surely this worker's (a lapsed one may have been taken over meanwhile)
    for (const conversationId of conversationIds) {
      const mine = this.held.get(conversationId);
      if (mine?.owner !== workerId) continue;
      if (mine.until > now) mine.until = until;
      else this.held.delete(conversationId);
    }
  }

  /**
   * Takes over expired leases whose owner still has claimed requests in the conversation (a crashed or cut-off
   * worker) and puts those requests back to NEW, so this worker resumes the conversation after `ttlMs` instead of
   * waiting for the stale-lock sweep. The lease moves with a conditional update, so one worker wins each
   * conversation. A request the old owner was executing runs again (at-least-once, as with the stale sweep).
   * Returns how many requests it released.
   */
  public async recoverLapsedLeases(workerId: string, limit = 50): Promise<number> {
    if (!this.leases) return 0;
    const now = new Date(this.clock());
    const expired: Array<{ conversationId: number; owner: string }> = await this.prisma.conversationLease.findMany({
      where: { owner: { not: workerId }, leaseUntil: { lte: now } },
      select: { conversationId: true, owner: true },
      take: limit,
    });
    if (!expired.length) return 0;
    const claimedBy = (owner: string) => ({ status: 'WAITING', lockedBy: owner, pendingDependencies: { lte: 0 } });
    const stuck: Array<{ conversationId: number; lockedBy: string }> = await this.prisma.request.findMany({
      where: { OR: expired.map(l => ({ conversationId: l.conversationId, ...claimedBy(l.owner) })) },
      select: { conversationId: true, lockedBy: true },
      distinct: ['conversationId'],
    });
    let released = 0;
    for (const { conversationId, lockedBy: owner } of stuck) {
      const taken = await this.prisma.conversationLease.updateMany({
        where: { conversationId, owner, leaseUntil: { lte: now } },
        data: { owner: workerId, leaseUntil: new Date(now.getTime() + this.leases.ttlMs) },
      });
      if (!taken.count) continue;
      this.held.set(conversationId, { owner: workerId, until: now.getTime() + this.leases.ttlMs });
      const freed = await this.prisma.request.updateMany({
        where: { conversationId, ...claimedBy(owner) },
        data: { status: 'NEW', lockedBy: null, lockedAt: null },
      });
      released += freed.count;
    }
    return released;
  }

  /** Gives up this worker's leases except on `keep` (conversations still in flight). Returns how many it released. */
  public async releaseLeases(workerId: string, keep: readonly number[] = []): Promise<number> {
    if (!this.leases) return 0;
    const released = await this.prisma.conversationLease.deleteMany({
      where: { owner: workerId, ...(keep.length ? { conversationId: { notIn: [...new Set(keep)] } } : {}) },
    });
    for (const [conversationId, mine] of this.held) {
      if (mine.owner === workerId && !keep.includes(conversationId)) this.held.delete(conversationId);
    }
    return released.count;
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

    claim: async (workerId, options: ClaimOptions) => (await this.claimRows(workerId, options)).map(toRequest),

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
      // Read first, then update by id: a status-filtered update locks every WAITING row it scans (MariaDB deadlocks)
      const where = this.scoped({ status: 'WAITING', lockedBy: { not: null }, lockedAt: { lte: lockedBefore }, pendingDependencies: 0 });
      const ids = (await this.prisma.request.findMany({ where, select: { id: true }, take: 500 })).map((r: any) => r.id);
      if (!ids.length) return 0;
      const released = await this.prisma.request.updateMany({
        where: { AND: [{ id: { in: ids } }, where] },
        data: { status: 'NEW', lockedBy: null, lockedAt: null },
      });
      return released.count;
    },

    find: async (filter, { orderBy = 'id', take } = {}) => {
      const rows = await this.prisma.request.findMany({ where: this.scoped(requestWhere(filter)), orderBy: ORDERS[orderBy], ...(take != null ? { take } : {}) });
      return rows.map(toRequest);
    },

    first: async (filter, { orderBy = 'id' } = {}) => {
      const row = await this.prisma.request.findFirst({ where: this.scoped(requestWhere(filter)), orderBy: ORDERS[orderBy] });
      return row ? toRequest(row) : null;
    },

    count: async filter => this.prisma.request.count({ where: this.scoped(requestWhere(filter)) }),

    updateWhere: async (filter, patch) =>
      (await this.prisma.request.updateMany({ where: this.scoped(requestWhere(filter)), data: withJsonNulls(patch, 'update') })).count,

    delete: async ids => {
      const visible = this.scope
        ? (await this.prisma.request.findMany({ where: this.scoped({ id: { in: [...ids] } }), select: { id: true } })).map((r: any) => r.id)
        : [...ids];
      if (!visible.length) return 0;
      await this.prisma.response.deleteMany({ where: { requestId: { in: visible } } });
      return (await this.prisma.request.deleteMany({ where: { id: { in: visible } } })).count;
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

    latestFor: async requestIds => {
      const latest = new Map<number, StoredResponse>();
      if (!requestIds.length) return latest;
      const rows = await this.prisma.response.findMany({ where: this.scoped({ requestId: { in: [...requestIds] } }), orderBy: { id: 'asc' } });
      for (const row of rows) latest.set(row.requestId, toResponse(row));
      return latest;
    },
  };

  public events: EventRepository = {
    append: async input => {
      if (!(await this.conversationVisible(input.conversationId))) {
        throw new Error(`[storage] Conversation ${input.conversationId} is outside the active scope`);
      }
      return toEvent(await this.prisma.busEvent.create({ data: input }));
    },

    after: async (conversationId, afterId, { eventNames, limit, forTarget } = {}) => {
      if (!(await this.conversationVisible(conversationId))) return [];
      const rows = await this.prisma.busEvent.findMany({
        where: {
          conversationId,
          id: { gt: afterId },
          ...(eventNames ? { eventName: { in: [...eventNames] } } : {}),
          ...(forTarget !== undefined ? { OR: forTarget != null ? [{ target: null }, { target: forTarget }] : [{ target: null }] } : {}),
        },
        orderBy: { id: 'asc' },
        ...(limit != null ? { take: limit } : {}),
      });
      return rows.map(toEvent);
    },

    latest: async (conversationId, { before } = {}) => {
      if (!(await this.conversationVisible(conversationId))) return null;
      const row = await this.prisma.busEvent.findFirst({
        where: { conversationId, ...(before ? { createdAt: { lt: before } } : {}) },
        orderBy: { id: 'desc' },
      });
      return row ? toEvent(row) : null;
    },
  };
}
