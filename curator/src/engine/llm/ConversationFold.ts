import { createHash } from 'node:crypto';
import type { LlmMessage } from './ILlmProvider.js';
import {
  defaultRenderers,
  entriesFromEvents,
  entriesFromResponses,
  isVisibleTo,
  type EntryRenderer,
  type StoredEventRow,
  type StoredResponseRow,
} from './ConversationContext.js';

/** A stored row, in conversation order: a Response (its Request attached) or a bus event. */
export type ConversationRow =
  | { kind: 'response'; row: StoredResponseRow }
  | { kind: 'event'; row: StoredEventRow };

export interface ContextAccumulator {
  readonly viewer: string;
  /** Messages built so far. Earlier messages are frozen: a reducer can only append. */
  readonly messages: readonly LlmMessage[];
  /** Reducer memory carried across builds (must stay JSON-serialisable). */
  scratch: Record<string, any>;
  push(...messages: LlmMessage[]): void;
}

/** Called once per row, in order. Decide what (if anything) the row adds to this viewer's prompt. */
export type ContextReducer = (acc: ContextAccumulator, row: ConversationRow) => void;

export interface ContextSnapshot {
  viewer: string;
  /** Identifies the reducer logic: a different version never reuses an old snapshot. */
  version: string;
  systemHash: string;
  /** Highest row id already folded, per kind. */
  cursor: { response: number; event: number };
  messages: readonly LlmMessage[];
  scratch: Record<string, any>;
  /** Rolling hash of system prompt + messages: equal prefixHash means an identical cached prefix. */
  prefixHash: string;
}

export interface FoldOptions {
  viewer: string;
  system?: string;
  version?: string;
  from?: ContextSnapshot;
}

export interface FoldResult {
  snapshot: ContextSnapshot;
  /** Only the messages produced by this fold: what a provider has not seen yet. */
  added: readonly LlmMessage[];
  /** How many leading messages came from the snapshot (the cacheable prefix). */
  cachedCount: number;
  reused: boolean;
}

const sha = (...parts: string[]) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p).update('\u0000');
  return h.digest('hex');
};

const systemHashOf = (system?: string) => sha('system', system ?? '');

export function isSnapshotValid(from: ContextSnapshot | undefined, o: { viewer: string; system?: string; version?: string }): from is ContextSnapshot {
  return !!from && from.viewer === o.viewer && from.version === (o.version ?? '') && from.systemHash === systemHashOf(o.system);
}

/**
 * Folds rows through `reducer`. With a valid `from` snapshot, rows it already covers are skipped, so only new
 * rows are processed and the earlier messages (and their hash) are carried over untouched. `rows` must be
 * ordered; with no valid snapshot it must be the full history.
 */
export function foldConversation(rows: Iterable<ConversationRow>, reducer: ContextReducer, opts: FoldOptions): FoldResult {
  const reused = isSnapshotValid(opts.from, opts);
  const start = reused ? opts.from! : undefined;
  const messages: LlmMessage[] = start ? [...start.messages] : [];
  const cursor = start ? { ...start.cursor } : { response: 0, event: 0 };
  const scratch: Record<string, any> = start ? JSON.parse(JSON.stringify(start.scratch)) : {};
  let prefixHash = start ? start.prefixHash : systemHashOf(opts.system);
  const cachedCount = messages.length;

  const acc: ContextAccumulator = {
    viewer: opts.viewer,
    get messages() { return messages; },
    scratch,
    push(...added: LlmMessage[]) {
      for (const m of added) {
        const frozen = Object.freeze({ ...m });
        messages.push(frozen);
        prefixHash = sha(prefixHash, JSON.stringify(frozen));
      }
    },
  };

  for (const r of rows) {
    if (r.row.id <= cursor[r.kind]) continue;
    reducer(acc, r);
    cursor[r.kind] = r.row.id;
  }

  return {
    snapshot: {
      viewer: opts.viewer,
      version: opts.version ?? '',
      systemHash: systemHashOf(opts.system),
      cursor,
      messages,
      scratch: acc.scratch,
      prefixHash,
    },
    added: messages.slice(cachedCount),
    cachedCount,
    reused,
  };
}

/** The standard reducer: rows become entries, filtered by audience and rendered per speech mode. */
export function entryReducer(options: { renderers?: Record<string, EntryRenderer>; label?: (speaker: string) => string } = {}): ContextReducer {
  const renderers = { ...defaultRenderers, ...(options.renderers ?? {}) };
  const label = options.label ?? ((s: string) => s);
  return (acc, r) => {
    const entries = r.kind === 'response' ? entriesFromResponses([r.row]) : entriesFromEvents([r.row]);
    for (const entry of entries) {
      if (!isVisibleTo(entry, acc.viewer)) continue;
      const out = renderers[entry.mode]?.(entry, { viewer: acc.viewer, label });
      if (out) acc.push(...(Array.isArray(out) ? out : [out]));
    }
  };
}

export interface ContextSnapshotStore {
  get(key: string): ContextSnapshot | undefined;
  set(key: string, snapshot: ContextSnapshot): void;
}

export class MemoryContextStore implements ContextSnapshotStore {
  private readonly snaps = new Map<string, ContextSnapshot>();
  get(key: string) { return this.snaps.get(key); }
  set(key: string, snapshot: ContextSnapshot) { this.snaps.set(key, snapshot); }
}

/** Loads responses and events with ids above the cursor, merged into conversation order. */
export async function loadConversationRows(
  prisma: any,
  conversationId: number,
  after: { response: number; event: number } = { response: 0, event: 0 },
  eventNames?: string[],
  excludeRequestId?: number,
): Promise<ConversationRow[]> {
  const responses: StoredResponseRow[] = await prisma.response.findMany({
    where: { conversationId, id: { gt: after.response }, ...(excludeRequestId ? { requestId: { not: excludeRequestId } } : {}) },
    orderBy: { id: 'asc' },
    include: { request: true },
  });
  const events: StoredEventRow[] = prisma.eventLog
    ? await prisma.eventLog.findMany({
        where: { conversationId, id: { gt: after.event }, ...(eventNames ? { eventName: { in: eventNames } } : {}) },
        orderBy: { id: 'asc' },
      })
    : [];
  const rows: ConversationRow[] = [
    ...responses.map((row) => ({ kind: 'response' as const, row })),
    ...events.map((row) => ({ kind: 'event' as const, row })),
  ];
  return rows.sort((a, b) => a.row.createdAt.getTime() - b.row.createdAt.getTime() || (a.kind === b.kind ? a.row.id - b.row.id : a.kind === 'event' ? -1 : 1));
}

export interface BuildContextOptions {
  system?: string;
  version?: string;
  reducer?: ContextReducer;
  store?: ContextSnapshotStore;
  eventNames?: string[];
  /** Skip this request's own Responses (an agent's tool-loop turns are not conversation yet). */
  excludeRequestId?: number;
}

export interface BuiltContext extends FoldResult {
  systemPrompt?: string;
  messages: readonly LlmMessage[];
  prefixHash: string;
}

/**
 * Builds one participant's prompt from the stored rows. With a store, the previous snapshot is reused and
 * only rows after its cursor are loaded and folded: the existing prefix is never reprocessed or rewritten.
 */
export async function buildContext(prisma: any, conversationId: number, viewer: string, opts: BuildContextOptions = {}): Promise<BuiltContext> {
  const key = `${conversationId}:${viewer}`;
  const saved = opts.store?.get(key);
  const usable = isSnapshotValid(saved, { viewer, system: opts.system, version: opts.version });
  const rows = await loadConversationRows(prisma, conversationId, usable ? saved!.cursor : undefined, opts.eventNames, opts.excludeRequestId);
  const result = foldConversation(rows, opts.reducer ?? entryReducer(), { viewer, system: opts.system, version: opts.version, from: usable ? saved : undefined });
  opts.store?.set(key, result.snapshot);
  return { ...result, systemPrompt: opts.system, messages: result.snapshot.messages, prefixHash: result.snapshot.prefixHash };
}
