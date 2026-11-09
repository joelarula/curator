import { computed, getCurrentScope, onScopeDispose, ref } from 'vue';
import {
  PROGRESS_EVENT_TYPE,
  applyProgressEvent,
  createRunTimeline,
  isProgressEventPayload,
  type ProgressEvent,
  type RunTimeline,
} from '@curator/host/contracts';

// The fold itself lives in the host contract (shared with the CLI); re-exported for console consumers.
export {
  applyProgressEvent,
  createRunTimeline,
  summarizeRun,
  isRunDone,
  runDurationMs,
  type RunTimeline,
  type RunStep,
  type RunStepState,
  type RunToolCall,
} from '@curator/host/contracts';

export type ProgressSubscribe = (callback: (type: string, payload: any) => void) => () => void;

/**
 * Follows `curator:progress` through the console adapter's `onProgress` and folds it into the current turn's run.
 * Events are buffered, so ones that arrive before `begin()` (the engine can start, or even finish, before the trigger
 * call returns) still count.
 */
export function useRunTimeline(subscribe?: ProgressSubscribe, options: { bufferSize?: number } = {}) {
  const bufferSize = options.bufferSize ?? 200;
  const buffer: ProgressEvent[] = [];
  const current = ref<RunTimeline | null>(null);

  function ingest(type: string, payload: unknown): void {
    if (type !== PROGRESS_EVENT_TYPE || !isProgressEventPayload(payload)) return;
    buffer.push(payload);
    if (buffer.length > bufferSize) buffer.shift();
    if (current.value?.active) applyProgressEvent(current.value, payload);
  }

  const unsubscribe = subscribe ? subscribe(ingest) : null;
  if (unsubscribe && getCurrentScope()) onScopeDispose(unsubscribe);

  /** Starts tracking the run of `rootRequestId`, replaying buffered events that already belong to it. */
  function begin(rootRequestId: number | string): RunTimeline | null {
    const id = Number(rootRequestId);
    if (!Number.isFinite(id)) return null;
    current.value = createRunTimeline({ rootRequestId: id });
    for (const event of buffer) applyProgressEvent(current.value, event);
    return current.value;
  }

  /** Stops tracking; the run stays as `current` (inactive) until the next `begin`. */
  function end(): void {
    if (current.value) current.value.active = false;
  }

  /** Forgets the current run (a new turn starts; turns without a root request then show no run). */
  function reset(): void {
    current.value = null;
  }

  /** Plain copy of the current run, for turn history. */
  function snapshot(): RunTimeline | null {
    if (!current.value) return null;
    const copy: RunTimeline = JSON.parse(JSON.stringify(current.value));
    copy.active = false;
    return copy;
  }

  const activeLine = computed(() => (current.value?.active ? current.value.lastLine : null));

  return { current, activeLine, ingest, begin, end, reset, snapshot, dispose: () => unsubscribe?.() };
}

export type RunTimelineHandle = ReturnType<typeof useRunTimeline>;
