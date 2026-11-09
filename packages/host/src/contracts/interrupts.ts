/**
 * Interrupts on the client side: what to show for an open interrupt (from `wait.opened` or `conversation_interrupts`)
 * and the value that resumes it through `conversation_resume`. Shared by the web console and the CLI; pure and
 * browser-safe.
 */
import type { CuratorInterrupt, ProgressEvent } from '@curator/agent-server';

/** How a client asks for the resume value. */
export type InterruptInputMode = 'choices' | 'text' | 'json' | 'approval' | 'event';

/** One answer a client can offer; `value` is passed to `conversation_resume` as is. */
export interface InterruptOption {
  label: string;
  value: unknown;
  description?: string;
}

/** Tool approval answers (`APPROVAL_RESUME_SCHEMA`). */
export const APPROVAL_OPTIONS: readonly InterruptOption[] = [
  { label: 'Approve once', value: { approved: true, scope: 'ONETIME' } },
  { label: 'Approve for this conversation', value: { approved: true, scope: 'CONVERSATION' } },
  { label: 'Deny', value: { approved: false } },
];

export function interruptInputMode(interrupt: CuratorInterrupt): InterruptInputMode {
  if (interrupt.kind === 'approval') return 'approval';
  if (interrupt.kind === 'event') return 'event';
  const choices = interrupt.payload?.choices;
  if (Array.isArray(choices) && choices.length > 0) return 'choices';
  const type = interrupt.resumeSchema?.type;
  if (type && type !== 'string') return 'json';
  return 'text';
}

/** Answers to offer: approval options, or the prompt's choices (`value`, else `id`, else the label). */
export function interruptOptions(interrupt: CuratorInterrupt): InterruptOption[] {
  if (interrupt.kind === 'approval') return [...APPROVAL_OPTIONS];
  const choices = interrupt.payload?.choices;
  if (!Array.isArray(choices)) return [];
  return choices.map((c: any, i: number) => {
    if (typeof c !== 'object' || c === null) return { label: String(c), value: c };
    const value = c.value !== undefined ? c.value : c.id !== undefined ? c.id : c.label ?? `choice_${i + 1}`;
    return { label: String(c.label ?? c.title ?? c.name ?? value), value, ...(c.description ? { description: String(c.description) } : {}) };
  });
}

/** One-line heading: the prompt, or a default per kind. */
export function interruptTitle(interrupt: CuratorInterrupt): string {
  if (interrupt.prompt) return interrupt.prompt;
  if (interrupt.kind === 'approval') return `Approve tool '${interrupt.payload?.tool ?? 'unknown'}'?`;
  if (interrupt.kind === 'event') return `Waiting for ${(interrupt.payload?.eventNames ?? []).join(', ') || 'an event'}`;
  return 'Input required';
}

/**
 * Keeps the list of open interrupts in step with `wait.opened` / `wait.resumed`. Returns a new list when it changed,
 * otherwise the same list (so callers can compare by identity).
 */
export function applyInterruptEvent(open: readonly CuratorInterrupt[], event: ProgressEvent): CuratorInterrupt[] {
  if (event.kind === 'wait.opened' && event.interrupt?.id) {
    return [...open.filter((i) => i.id !== event.interrupt.id), event.interrupt];
  }
  if (event.kind === 'wait.resumed') {
    const next = open.filter((i) => i.id !== event.interruptId);
    return next.length === open.length ? (open as CuratorInterrupt[]) : next;
  }
  return open as CuratorInterrupt[];
}
