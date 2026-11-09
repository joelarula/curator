import { computed, getCurrentScope, onScopeDispose, ref } from 'vue';
import {
  PROGRESS_EVENT_TYPE,
  applyInterruptEvent,
  interruptInputMode,
  isProgressEventPayload,
  type CuratorInterrupt,
} from '@curator/host/contracts';
import type { ProgressSubscribe } from './useRunTimeline';

/** Runs a tool through the host (the console's `executeTool`, i.e. `host.runTool`) and returns its result. */
export type HarnessToolRunner = (name: string, args: Record<string, unknown>) => Promise<any>;

/**
 * Open interrupts (human prompts, tool approvals, event waits): kept in step with `wait.opened` / `wait.resumed`,
 * loaded with `conversation_interrupts`, answered with `conversation_resume` (never by calling a handler).
 */
export function useInterrupts(subscribe: ProgressSubscribe | undefined, runTool: HarnessToolRunner) {
  const open = ref<CuratorInterrupt[]>([]);
  const resuming = ref<string | null>(null);
  const error = ref<string | null>(null);
  /** Interrupt whose last resume failed (its card shows `error`). */
  const failedId = ref<string | null>(null);

  function ingest(type: string, payload: unknown): void {
    if (type !== PROGRESS_EVENT_TYPE || !isProgressEventPayload(payload)) return;
    const next = applyInterruptEvent(open.value, payload);
    if (next !== open.value) open.value = next;
  }

  const unsubscribe = subscribe ? subscribe(ingest) : null;
  if (unsubscribe && getCurrentScope()) onScopeDispose(unsubscribe);

  /** Loads the open interrupts of the active project (optionally one conversation), e.g. after a reload. */
  async function hydrate(conversationId?: number): Promise<void> {
    try {
      const res = await runTool('conversation_interrupts', conversationId != null ? { conversationId } : {});
      const list = Array.isArray(res?.interrupts) ? res.interrupts : [];
      open.value = list;
    } catch (err: any) {
      error.value = err?.message ?? String(err);
    }
  }

  /** Answers an interrupt; the server validates `value` against its resumeSchema. */
  async function resume(interruptId: string, value: unknown): Promise<boolean> {
    resuming.value = interruptId;
    error.value = null;
    failedId.value = null;
    try {
      await runTool('conversation_resume', { interruptId, value });
      open.value = open.value.filter((i) => i.id !== interruptId);
      return true;
    } catch (err: any) {
      error.value = err?.message ?? String(err);
      failedId.value = interruptId;
      return false;
    } finally {
      resuming.value = null;
    }
  }

  /** Newest open interrupt whose answer is a pick from choices (shown by HarnessChoices). */
  const choiceInterrupt = computed(() => [...open.value].reverse().find((i) => interruptInputMode(i) === 'choices') ?? null);
  /** Interrupts shown as cards: approvals, free input, event waits. */
  const cardInterrupts = computed(() => open.value.filter((i) => interruptInputMode(i) !== 'choices'));

  return { open, resuming, error, failedId, ingest, hydrate, resume, choiceInterrupt, cardInterrupts, dispose: () => unsubscribe?.() };
}

export type InterruptsHandle = ReturnType<typeof useInterrupts>;
