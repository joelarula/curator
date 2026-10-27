/**
 * Event-sourced conversation state (Akka Persistence style).
 *
 *   state = events.foldLeft(initial)(apply)
 *
 * The append-only EventLog is the source of truth. `Conversation.metadata` is only a materialized view of it
 * (a snapshot plus the id of the last state event folded in, `__stateSeq`), so it can always be rebuilt,
 * replayed to any earlier point, or rewound without losing history.
 *
 * Two reserved event kinds live in the same EventLog (and share its sequence with the bus events):
 *  - `__state.patch`  { scope?, set }  merge `set` into shared state, or into the private bucket `scope`
 *  - `__state.rewind` { to }           state becomes whatever it was right after event `to` (compensating event)
 */

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

/** Brings the `Conversation.metadata` snapshot up to date with the log and returns it. */
async function materializeIn(db: any, conversationId: number): Promise<StateSnapshot> {
  const conv = await db.conversation.findUnique({ where: { id: conversationId } });
  const snap = readSnapshot(conv?.metadata);
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

/** Appends a patch event and refreshes the materialized view. Returns the event's sequence id and new state. */
export async function appendStatePatch(
  prisma: any,
  conversationId: number,
  patch: StatePatchPayload,
): Promise<{ seq: number; state: ConversationStateData }> {
  return atomically(prisma, async (db) => {
    const row = await db.eventLog.create({ data: { conversationId, eventName: STATE_PATCH, payload: patch } });
    const { state } = await materializeIn(db, conversationId);
    return { seq: row.id, state };
  });
}

/** Zero-loss rollback: appends a compensating event; the abandoned events stay in the log for debugging. */
export async function rewindState(
  prisma: any,
  conversationId: number,
  toSeq: number,
): Promise<{ seq: number; state: ConversationStateData }> {
  return atomically(prisma, async (db) => {
    const row = await db.eventLog.create({ data: { conversationId, eventName: STATE_REWIND, payload: { to: toSeq } } });
    const { state } = await materializeIn(db, conversationId);
    return { seq: row.id, state };
  });
}

/** Time travel: the conversation state exactly as it was right after event `upTo` (default: now). */
export async function stateAt(prisma: any, conversationId: number, upTo?: number): Promise<ConversationStateData> {
  return foldState(await stateEventsAfter(prisma, conversationId, 0, upTo), { upTo }).state;
}

/** Rebuilds the snapshot purely from the log (repair / verification). */
export async function rebuildStateSnapshot(prisma: any, conversationId: number): Promise<StateSnapshot> {
  return atomically(prisma, async (db) => {
    const next = foldState(await stateEventsAfter(db, conversationId, 0));
    await db.conversation.update({
      where: { id: conversationId },
      data: { metadata: { ...next.state, [STATE_SEQ_KEY]: next.seq } },
    });
    return next;
  });
}

/** The ordered state events (the audit trail) for debugging UIs and replay. */
export function listStateEvents(prisma: any, conversationId: number, upTo?: number): Promise<StateEventRow[]> {
  return stateEventsAfter(prisma, conversationId, 0, upTo);
}
