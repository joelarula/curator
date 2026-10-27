import type { LlmMessage } from './ILlmProvider.js';

/**
 * One row of a conversation, whatever its speech mode. The builder never inspects `mode` itself:
 * how an entry reads in a prompt is decided by the renderer registered for that mode.
 */
export interface ConversationEntry {
  id?: number | string;
  at?: number;
  /** Agent id/name, 'human', 'system'... */
  speaker: string;
  /** say, whisper, human, tool, system, or any use-case specific mode. */
  mode: string;
  text: string;
  /** 'all' (default) or the ids that may read it. The speaker can always read its own entries. */
  audience?: 'all' | string[];
  meta?: Record<string, any>;
}

export interface RenderContext {
  viewer: string;
  label: (speaker: string) => string;
}

/** Returns the message(s) an entry becomes for `viewer`, or null to leave it out of the prompt. */
export type EntryRenderer = (entry: ConversationEntry, ctx: RenderContext) => LlmMessage | LlmMessage[] | null;

export interface ConversationContextOptions {
  /** Persona and instructions: always the fixed head of the request. */
  system?: string;
  /** Per-mode overrides/additions to the default renderers. */
  renderers?: Record<string, EntryRenderer>;
  /** Keep only the last N rendered messages. */
  limit?: number;
  label?: (speaker: string) => string;
}

export interface ConversationContext {
  systemPrompt?: string;
  messages: LlmMessage[];
}

const own = (entry: ConversationEntry, ctx: RenderContext) => entry.speaker === ctx.viewer;

/** An entry is readable by its audience and by its own speaker. */
export const isVisibleTo = (entry: ConversationEntry, viewer: string): boolean =>
  entry.audience == null || entry.audience === 'all' || entry.speaker === viewer || entry.audience.includes(viewer);

/** What the speaker said is an assistant turn; what others said is a labelled user turn. */
const spoken = (suffix = ''): EntryRenderer => (entry, ctx) =>
  own(entry, ctx)
    ? { role: 'assistant', content: entry.text }
    : { role: 'user', content: `[${ctx.label(entry.speaker)}${suffix}]: ${entry.text}` };

export const defaultRenderers: Record<string, EntryRenderer> = {
  say: spoken(),
  whisper: spoken(' whispers'),
  human: spoken(),
  system: (entry) => ({ role: 'user', content: `[system]: ${entry.text}` }),
  tool: (entry) => ({ role: 'tool', toolName: String(entry.meta?.toolName ?? 'tool'), content: entry.text }),
};

/**
 * Folds a conversation, row by row, into the prompt one participant would see.
 * Visibility is decided per entry (`audience`), rendering per mode, so use cases customise by
 * registering renderers rather than by changing the builder.
 */
export class ConversationContextBuilder {
  private readonly entries: ConversationEntry[] = [];
  private readonly renderers: Record<string, EntryRenderer>;

  constructor(private readonly options: ConversationContextOptions = {}) {
    this.renderers = { ...defaultRenderers, ...(options.renderers ?? {}) };
  }

  push(entry: ConversationEntry): this {
    this.entries.push(entry);
    return this;
  }

  pushAll(entries: Iterable<ConversationEntry>): this {
    for (const entry of entries) this.push(entry);
    return this;
  }

  visibleTo(viewer: string): ConversationEntry[] {
    return this.entries.filter((e) => isVisibleTo(e, viewer));
  }

  build(viewer: string): ConversationContext {
    const ctx: RenderContext = { viewer, label: this.options.label ?? ((s) => s) };
    let messages: LlmMessage[] = [];
    for (const entry of this.visibleTo(viewer)) {
      const rendered = this.renderers[entry.mode]?.(entry, ctx);
      if (rendered) messages.push(...(Array.isArray(rendered) ? rendered : [rendered]));
    }
    const { limit } = this.options;
    if (limit && limit > 0 && messages.length > limit) messages = messages.slice(-limit);
    return { systemPrompt: this.options.system, messages };
  }
}

/** A conversation row as stored: a Response (with its Request) or a bus event from the EventLog. */
export interface StoredResponseRow {
  id: number;
  content: string;
  createdAt: Date;
  request?: { agentId?: number | string | null; ast?: any } | null;
}

export interface StoredEventRow {
  id: number;
  eventName: string;
  payload: any;
  target?: string | null;
  createdAt: Date;
}

export interface EntryAdapterOptions {
  /** Response speaker when the request has no agent (defaults to the agent node's name). */
  speakerOf?: (row: StoredResponseRow) => string;
  /** Event name -> speech mode (defaults to the event name, or payload.mode). */
  modeOf?: (row: StoredEventRow) => string;
}

export function entriesFromResponses(rows: StoredResponseRow[], opts: EntryAdapterOptions = {}): ConversationEntry[] {
  const out: ConversationEntry[] = [];
  for (const row of rows) {
    const ast = row.request?.ast;
    if (ast?.exclude_from_history) continue;
    // The node's name identifies the speaker: parallel branches can share one agentId.
    const speaker = opts.speakerOf?.(row) ?? String((ast?.type === 'Curator_Agent' ? ast.agentName : undefined) ?? row.request?.agentId ?? 'agent');
    const base = { id: `r${row.id}`, at: row.createdAt.getTime(), text: row.content };
    if (ast?.type === 'Curator_Agent') out.push({ ...base, speaker, mode: 'say' });
    else if (ast?.type === 'Curator_HumanInput') out.push({ ...base, speaker: 'human', mode: 'human' });
    else if (ast?.type === 'Curator_Tool' || ast?.type === 'Curator_Script') {
      // Tool output is private to the agent that ran it.
      out.push({ ...base, speaker, mode: 'tool', audience: [speaker], meta: { toolName: ast.toolName ?? ast.name } });
    }
  }
  return out;
}

export function entriesFromEvents(rows: StoredEventRow[], opts: EntryAdapterOptions = {}): ConversationEntry[] {
  // Reserved `__state.*` events are the event-sourced state, not conversation: never part of a prompt.
  return rows.filter((row) => !row.eventName.startsWith('__state.')).map((row) => {
    const p = row.payload;
    const text = typeof p === 'string' ? p : (p?.text ?? JSON.stringify(p ?? {}));
    const speaker = String(p?.from ?? 'unknown');
    const mode = opts.modeOf?.(row) ?? String(p?.mode ?? row.eventName);
    // An addressed event is readable by its target (and its speaker); a broadcast by everyone.
    const audience = row.target ? [String(row.target)] : 'all';
    return { id: `e${row.id}`, at: row.createdAt.getTime(), speaker, mode, text, audience };
  });
}

/** Loads a conversation's responses and bus events and returns them as entries in time order. */
export async function loadConversationEntries(
  prisma: any,
  conversationId: number,
  opts: EntryAdapterOptions & { eventNames?: string[] } = {},
): Promise<ConversationEntry[]> {
  const responses: StoredResponseRow[] = await prisma.response.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { request: true },
  });
  const events: StoredEventRow[] = prisma.eventLog
    ? await prisma.eventLog.findMany({
        where: { conversationId, ...(opts.eventNames ? { eventName: { in: opts.eventNames } } : {}) },
        orderBy: { id: 'asc' },
      })
    : [];
  return [...entriesFromResponses(responses, opts), ...entriesFromEvents(events, opts)].sort(
    (a, b) => (a.at ?? 0) - (b.at ?? 0) || String(a.id).localeCompare(String(b.id)),
  );
}
