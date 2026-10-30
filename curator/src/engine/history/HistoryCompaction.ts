import type { LlmMessage } from '../llm/ILlmProvider.js';

/** One earlier turn: the messages replayed for one Request (an agent turn, a human input, a tool step). */
export interface HistoryTurn {
  requestId: number;
  messages: LlmMessage[];
}

/** A stored summary of earlier turns, up to and including `throughRequestId`. */
export interface HistorySummary {
  text: string;
  throughRequestId: number;
}

export interface HistoryCompactionInput {
  /** Earlier turns, oldest first (already shaped by the history profile). */
  turns: HistoryTurn[];
  /** The summary this compactor stored last for this agent, when its turn is still in `turns`. */
  previous?: HistorySummary;
  /** Strategy arguments (`{ use, args }`, or parsed from `name:k=v,k=v`). */
  args: Record<string, unknown>;
  agentName?: string;
  /** Summarizes `turns` with the agent's model; `previous` is earlier summary text to fold in. */
  summarize(turns: HistoryTurn[], previous?: string): Promise<string>;
}

export interface HistoryCompactionResult {
  /** The history the model gets. */
  messages: LlmMessage[];
  /**
   * The summary the messages are built on. A summary with a new `throughRequestId` is stored, and given back as
   * `previous` on later turns: re-pack only when needed, so the prompt prefix stays stable for caching.
   */
  summary?: HistorySummary;
}

/** A pluggable history compaction strategy (plugin `historyCompactors`). */
export type CuratorHistoryCompactor = (input: HistoryCompactionInput) => Promise<HistoryCompactionResult>;

/** `'name'`, `'name:k=v,k=v'` or `{ use, args }`. */
export type HistoryCompactionSpec = string | { use: string; args?: Record<string, unknown> };

export function parseCompactionSpec(spec: HistoryCompactionSpec): { name: string; args: Record<string, unknown> } {
  if (typeof spec !== 'string') return { name: spec.use, args: spec.args ?? {} };
  const i = spec.indexOf(':');
  if (i < 0) return { name: spec, args: {} };
  const args: Record<string, unknown> = {};
  for (const pair of spec.slice(i + 1).split(',')) {
    const [k, v] = pair.split('=').map((s) => s.trim());
    if (!k) continue;
    args[k] = v === undefined ? true : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  }
  return { name: spec.slice(0, i), args };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback);

/** The summary as it is replayed: one user message ahead of the turns it does not cover. */
export const summaryMessage = (text: string): LlmMessage => ({ role: 'user', content: `[Summary of the earlier conversation]\n${text}` });

/**
 * Keeps `head` first turns and the newest turns verbatim and summarizes the turns between. Re-packs only when more
 * than `max` turns after the head are not covered by the stored summary, then covers all but the newest `keep`,
 * folding the previous summary in.
 */
export function packCompactor(defaults: { head: number; keep: number; max: number }): CuratorHistoryCompactor {
  return async ({ turns, previous, args, summarize }) => {
    const head = num(args.head, defaults.head);
    const keep = Math.max(1, num(args.keep, defaults.keep));
    const max = Math.max(keep, num(args.max, defaults.max));
    const headTurns = turns.slice(0, head);
    const rest = turns.slice(head);

    let summary = previous;
    let covered = summary ? rest.findIndex((t) => t.requestId === summary!.throughRequestId) : -1;
    if (covered < 0) summary = undefined;

    if (rest.length - (covered + 1) > max) {
      const through = rest.length - keep - 1;
      const text = await summarize(rest.slice(covered + 1, through + 1), summary?.text);
      summary = { text, throughRequestId: rest[through].requestId };
      covered = through;
    }

    const messages = [
      ...headTurns.flatMap((t) => t.messages),
      ...(summary ? [summaryMessage(summary.text)] : []),
      ...rest.slice(covered + 1).flatMap((t) => t.messages),
    ];
    return { messages, summary };
  };
}

/** Built-in strategies; plugins may add more or replace these by name. */
export const BUILTIN_HISTORY_COMPACTORS: Record<string, CuratorHistoryCompactor> = {
  /** Summarize from the start: `pack-first:keep=4,max=12`. */
  'pack-first': packCompactor({ head: 0, keep: 4, max: 12 }),
  /** Keep the opening turn(s), summarize the middle: `pack-middle:head=1,keep=4,max=12`. */
  'pack-middle': packCompactor({ head: 1, keep: 4, max: 12 }),
};

export class HistoryCompactors {
  private readonly compactors = new Map<string, CuratorHistoryCompactor>(Object.entries(BUILTIN_HISTORY_COMPACTORS));

  register(name: string, compactor: CuratorHistoryCompactor): void {
    this.compactors.set(name, compactor);
  }

  get(name: string): CuratorHistoryCompactor | undefined {
    return this.compactors.get(name);
  }
}

/** Used by processors whose engine has no registry of its own. */
export const defaultHistoryCompactors = new HistoryCompactors();

export const DEFAULT_SUMMARY_INSTRUCTION = [
  'You compact an earlier part of a conversation for your own later reference.',
  'Keep facts, names, numbers, decisions, open questions and what tools returned that still matters.',
  'Write it as concise notes in the language of the conversation. Do not answer anything.',
].join(' ');

/** Plain-text transcript of turns, the input of a summary. */
export function renderTranscript(turns: HistoryTurn[], previous?: string): string {
  const lines: string[] = [];
  if (previous) lines.push(`Earlier summary:\n${previous}`, '');
  for (const { messages } of turns) {
    for (const m of messages) {
      if (m.toolCalls?.length) {
        lines.push(`assistant called: ${m.toolCalls.map((c) => `${c.name}(${JSON.stringify(c.args ?? {})})`).join(', ')}`);
        if (m.content) lines.push(`assistant: ${m.content}`);
      } else {
        lines.push(`${m.role === 'tool' ? `tool ${m.toolName ?? ''}`.trim() : m.role}: ${m.content}`);
      }
    }
  }
  return lines.join('\n');
}
