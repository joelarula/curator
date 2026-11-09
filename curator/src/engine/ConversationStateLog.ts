/**
 * Event-sourced conversation state (Akka Persistence style).
 *
 *   state = events.foldLeft(initial)(apply)
 *
 * The append-only EventLog is the source of truth. `Conversation.metadata` is only a materialized view of it
 * (a snapshot plus the id of the last state event folded in, `__stateSeq`), so it can always be rebuilt,
 * replayed to any earlier point, or rewound without losing history.
 *
 * Two reserved event kinds make up the EventLog (dispatched bus events are in BusEvent, with their own ids):
 *  - `__state.patch`  { scope?, set }  merge `set` into shared state, or into the private bucket `scope`
 *  - `__state.rewind` { to }           state becomes whatever it was right after event `to` (compensating event)
 */

import { sqlDialect, sqlTag, type SqlDialect } from '../db/sqlDialect.js';

export const STATE_PATCH = '__state.patch';
export const STATE_REWIND = '__state.rewind';
export const STATE_EVENT_PREFIX = '__state.';
/** Snapshot cursor key inside the materialized `Conversation.metadata`. */
export const STATE_SEQ_KEY = '__stateSeq';

export type ConversationStateData = Record<string, any>;

export interface StateEventRow {
  id: number;
  eventName: string;
  payload: any;
  /** Request whose step wrote the event (null: written outside a workflow step). */
  source?: number | null;
}

export interface StatePatchPayload {
  scope?: string | null;
  set: Record<string, any>;
}

export interface StateSnapshot {
  state: ConversationStateData;
  /** Id of the last state event folded into `state`. */
  seq: number;
}

export const isStateEvent = (eventName: string) => eventName === STATE_PATCH || eventName === STATE_REWIND;

/** Pure reducer step: returns a new state, never mutates the input (so history can share structure). */
export function applyPatch(state: ConversationStateData, patch: StatePatchPayload): ConversationStateData {
  const set = patch?.set ?? {};
  if (patch?.scope != null) {
    const scopes = { ...(state.__scopes || {}) };
    scopes[patch.scope] = { ...(scopes[patch.scope] || {}), ...set };
    return { ...state, __scopes: scopes };
  }
  return { ...state, ...set };
}

/**
 * Folds state events (ascending by id) over `from`. `upTo` stops the fold, giving state at a past point.
 * A rewind restores the state recorded right after event `to`; rewinds past the start of `from` cannot be
 * resolved here, so callers must refold from zero (see `needsFullRefold`).
 */
export function foldState(
  events: Iterable<StateEventRow>,
  opts: { from?: StateSnapshot; upTo?: number } = {},
): StateSnapshot {
  let state: ConversationStateData = opts.from?.state ?? {};
  let seq = opts.from?.seq ?? 0;
  const base: StateSnapshot = { state, seq };
  const history: Array<[number, ConversationStateData]> = [];

  const stateAfter = (to: number): ConversationStateData => {
    for (let i = history.length - 1; i >= 0; i--) if (history[i][0] <= to) return history[i][1];
    return base.state;
  };

  for (const e of events) {
    if (e.id <= seq) continue;
    if (opts.upTo != null && e.id > opts.upTo) break;
    if (e.eventName === STATE_PATCH) state = applyPatch(state, e.payload);
    else if (e.eventName === STATE_REWIND) {
      const to = Number(e.payload?.to ?? 0);
      if (opts.from && to < opts.from.seq) throw new Error(`Rewind to ${to} precedes snapshot ${opts.from.seq}: refold from zero`);
      state = stateAfter(to);
    }
    else continue;
    history.push([e.id, state]);
    seq = e.id;
  }
  return { state, seq };
}

/** True when a rewind in `events` targets a point at or before the snapshot, which an incremental fold can't recover. */
export function needsFullRefold(events: StateEventRow[], from: StateSnapshot): boolean {
  return events.some((e) => e.eventName === STATE_REWIND && e.id > from.seq && Number(e.payload?.to ?? 0) < from.seq);
}

const parseMeta = (raw: any): Record<string, any> => {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return typeof raw === 'object' ? raw : {};
};

/** Splits stored metadata into the state view and its snapshot cursor. */
export function readSnapshot(metadata: any): StateSnapshot {
  const { [STATE_SEQ_KEY]: seq, ...state } = parseMeta(metadata);
  return { state, seq: typeof seq === 'number' ? seq : 0 };
}

const stateEventsAfter = (db: any, conversationId: number, after: number, upTo?: number): Promise<StateEventRow[]> =>
  db.eventLog.findMany({
    where: {
      conversationId,
      eventName: { in: [STATE_PATCH, STATE_REWIND] },
      id: upTo != null ? { gt: after, lte: upTo } : { gt: after },
    },
    orderBy: { id: 'asc' },
  });

/** The dialect of a client, or null for clients that are not Prisma (test doubles): those take no row locks. */
const dialectOf = (prisma: any): SqlDialect | null => {
  try {
    return sqlDialect(prisma);
  } catch {
    return null;
  }
};

/**
 * Reads the conversation's snapshot, locking its row for the rest of the transaction on Postgres/MariaDB
 * (`FOR UPDATE`; SQLite has a single writer). State writers of one conversation so run one after the other: each
 * folds the events of the writers before it, and event ids follow the lock order.
 * `head` is the log's last state event id, read in the same query (undefined: not known, read the log).
 */
async function lockedSnapshot(db: any, conversationId: number, dialect: SqlDialect | null): Promise<StateSnapshot & { head?: number }> {
  if (!dialect || dialect === 'sqlite' || typeof db.$queryRawUnsafe !== 'function') {
    return readSnapshot((await db.conversation.findUnique({ where: { id: conversationId } }))?.metadata);
  }
  const rows: any[] = await db.$queryRawUnsafe(
    ...sqlTag(dialect)`SELECT "metadata", (SELECT MAX("id") FROM "EventLog" WHERE "conversationId" = ${conversationId}
      AND "eventName" IN (${[STATE_PATCH, STATE_REWIND]})) AS "head" FROM "Conversation" WHERE "id" = ${conversationId} FOR UPDATE`
  );
  return { ...readSnapshot(rows[0]?.metadata), head: rows[0]?.head == null ? 0 : Number(rows[0].head) };
}

/** Brings the `Conversation.metadata` snapshot up to date with the log and returns it (locks the row, see above). */
async function materializeIn(db: any, conversationId: number, dialect: SqlDialect | null = null): Promise<StateSnapshot> {
  const { head, ...snap } = await lockedSnapshot(db, conversationId, dialect);
  // The snapshot is at the log's head (every append moves both): nothing to fold
  if (head !== undefined && head <= snap.seq) return snap;
  const events = await stateEventsAfter(db, conversationId, snap.seq);
  if (!events.length) return snap;
  const next = needsFullRefold(events, snap)
    ? foldState(await stateEventsAfter(db, conversationId, 0))
    : foldState(events, { from: snap });
  await db.conversation.update({
    where: { id: conversationId },
    data: { metadata: { ...next.state, [STATE_SEQ_KEY]: next.seq } },
  });
  return next;
}

/** Runs `fn` atomically when the client supports interactive transactions (SQLite serialises writers). */
const atomically = <T>(prisma: any, fn: (db: any) => Promise<T>): Promise<T> =>
  typeof prisma.$transaction === 'function' ? prisma.$transaction((tx: any) => fn(tx)) : fn(prisma);

/** A committed state transition, handed to projectors inside the transaction that appended it. */
export interface StateChange {
  /** Transaction client: projector writes commit or roll back together with the state event. */
  db: any;
  conversationId: number;
  event: StateEventRow;
  previous: ConversationStateData;
  state: ConversationStateData;
}

/** Derives read models (e.g. knowledge-graph triples) from state. Throwing rolls the state event back. */
export type StateProjector = (change: StateChange) => Promise<void> | void;

// Keyed by client so projectors fire for every appender of that database, and never for another database.
const projectorsByClient = new WeakMap<object, Set<StateProjector>>();

/** Makes `alias` (e.g. an `$extends` client of `prisma`) fire the same projectors, now and as they are registered. */
export function shareStateProjectors(prisma: object, alias: object): void {
  let projectors = projectorsByClient.get(prisma);
  if (!projectors) projectorsByClient.set(prisma, (projectors = new Set()));
  projectorsByClient.set(alias, projectors);
}

/** Registers `projector` for every state event appended through `prisma`. Returns an unregister function. */
export function registerStateProjector(prisma: object, projector: StateProjector): () => void {
  let projectors = projectorsByClient.get(prisma);
  if (!projectors) projectorsByClient.set(prisma, (projectors = new Set()));
  projectors.add(projector);
  return () => { projectors!.delete(projector); };
}

async function appendStateEvent(
  prisma: any,
  conversationId: number,
  eventName: string,
  payload: any,
  source: number | null = null,
): Promise<{ seq: number; state: ConversationStateData }> {
  const projectors = projectorsByClient.get(prisma);
  const dialect = dialectOf(prisma);
  return atomically(prisma, async (db) => {
    if (!db.eventLog?.create) {
      const conv = await db.conversation.findUnique({ where: { id: conversationId } });
      const snap = readSnapshot(conv?.metadata);
      const next = foldState([{ id: snap.seq + 1, eventName, payload }], { from: snap });
      await db.conversation.update({
        where: { id: conversationId },
        data: { metadata: { ...next.state, [STATE_SEQ_KEY]: next.seq } },
      });
      return { seq: next.seq, state: next.state };
    }
    // Lock first, then append: the event gets its id after every earlier writer's (see lockedSnapshot)
    const before = await materializeIn(db, conversationId, dialect);
    const event: StateEventRow = { id: 0, eventName, payload, source };
    event.id = (await db.eventLog.create({ data: { conversationId, eventName, payload, ...(source != null ? { source } : {}) } })).id;
    const { state } = needsFullRefold([event], before)
      ? foldState(await stateEventsAfter(db, conversationId, 0))
      : foldState([event], { from: before });
    await db.conversation.update({
      where: { id: conversationId },
      data: { metadata: { ...state, [STATE_SEQ_KEY]: event.id } },
    });
    for (const project of projectors ?? []) {
      await project({ db, conversationId, event, previous: before.state, state });
    }
    return { seq: event.id, state };
  });
}

/**
 * Appends a patch event and refreshes the materialized view. Returns the event's sequence id and new state.
 * `source` is the request whose step wrote it (`EventLog.source`): checkpoints and fork replay use it.
 */
export async function appendStatePatch(
  prisma: any,
  conversationId: number,
  patch: StatePatchPayload,
  opts: { source?: number | null } = {},
): Promise<{ seq: number; state: ConversationStateData }> {
  return appendStateEvent(prisma, conversationId, STATE_PATCH, patch, opts.source ?? null);
}

/** Zero-loss rollback: appends a compensating event; the abandoned events stay in the log for debugging. */
export async function rewindState(
  prisma: any,
  conversationId: number,
  toSeq: number,
): Promise<{ seq: number; state: ConversationStateData }> {
  return appendStateEvent(prisma, conversationId, STATE_REWIND, { to: toSeq });
}

/** Time travel: the conversation state exactly as it was right after event `upTo` (default: now). */
export async function stateAt(prisma: any, conversationId: number, upTo?: number): Promise<ConversationStateData> {
  return foldState(await stateEventsAfter(prisma, conversationId, 0, upTo), { upTo }).state;
}

/** Rebuilds the snapshot purely from the log (repair / verification). */
export async function rebuildStateSnapshot(prisma: any, conversationId: number): Promise<StateSnapshot> {
  const dialect = dialectOf(prisma);
  return atomically(prisma, async (db) => {
    await lockedSnapshot(db, conversationId, dialect);
    const next = foldState(await stateEventsAfter(db, conversationId, 0));
    await db.conversation.update({
      where: { id: conversationId },
      data: { metadata: { ...next.state, [STATE_SEQ_KEY]: next.seq } },
    });
    return next;
  });
}

/** Rows per delete statement when compacting (each its own statement; see Retention.deleteInChunks). */
const COMPACT_CHUNK = 500;

/**
 * Retention for a finished conversation: replaces its whole EventLog (its state events) with one
 * `__state.patch` holding the current state, so the log still rebuilds the same snapshot. History before it
 * (replay, rewind targets) is gone. Returns how many log rows were removed.
 *
 * The compacted event and the snapshot pointing at it commit together; the older rows are then deleted in
 * batches, outside that transaction. The snapshot never reads them again, and every later event has a higher id.
 */
export async function compactConversationLog(prisma: any, conversationId: number): Promise<number> {
  if (!prisma.eventLog?.deleteMany) return 0;
  const dialect = dialectOf(prisma);
  const compactedId = await atomically(prisma, async (db) => {
    const snap = await materializeIn(db, conversationId, dialect);
    const row = await db.eventLog.create({ data: { conversationId, eventName: STATE_PATCH, payload: { set: snap.state } } });
    await db.conversation.update({
      where: { id: conversationId },
      data: { metadata: { ...snap.state, [STATE_SEQ_KEY]: row.id } },
    });
    return row.id as number;
  });
  let removed = 0;
  for (;;) {
    const ids = (
      await prisma.eventLog.findMany({
        where: { conversationId, id: { lt: compactedId } },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: COMPACT_CHUNK,
      })
    ).map((r: any) => r.id);
    if (!ids.length) return removed;
    removed += (await prisma.eventLog.deleteMany({ where: { id: { in: ids } } })).count;
    if (ids.length < COMPACT_CHUNK) return removed;
  }
}

/** The ordered state events (the audit trail) for debugging UIs and replay. */
export function listStateEvents(prisma: any, conversationId: number, upTo?: number): Promise<StateEventRow[]> {
  return stateEventsAfter(prisma, conversationId, 0, upTo);
}
