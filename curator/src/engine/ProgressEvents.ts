/**
 * Progress events (docs/ENGINE_EVOLUTION_PLAN.md, Phase G): one typed, versioned stream that clients can follow
 * instead of inferring progress from request rows, logs or the older ad-hoc events. The processor emits each as
 * `curator:progress` through its `onEvent` (the host broadcasts it to listeners and WebSocket clients, filtered by
 * conversation). The older events (`request_start`, `request_done`, `curator:interrupt`, ...) are still emitted.
 *
 * Versioning: `v` changes only for breaking changes; new kinds and new optional fields may be added within a
 * version, so consumers must ignore kinds they do not know.
 */
import type { CuratorInterrupt, InterruptKind } from './Interrupts.js';

export const PROGRESS_EVENT = 'curator:progress';
export const PROGRESS_EVENT_VERSION = 1;

export type StepStatus = 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'SKIPPED';

interface ProgressBase {
  v: 1;
  /** Increases per emitting process (orders events of one worker; not global across workers). */
  seq: number;
  /** Epoch ms, from the processor's clock. */
  ts: number;
  conversationId: number;
  requestId?: number;
}

/** A step started running (its node resolved). */
export interface StepStartedEvent extends ProgressBase {
  kind: 'step.started';
  requestId: number;
  nodeType: string;
  /** Attempt number (1 = first run; see the node's `retry` policy). */
  attempt: number;
}

/** A step ended. */
export interface StepFinishedEvent extends ProgressBase {
  kind: 'step.finished';
  requestId: number;
  nodeType: string | null;
  status: StepStatus;
  durationMs: number | null;
}

/** A failed attempt will run again after `delayMs`. */
export interface StepRetryingEvent extends ProgressBase {
  kind: 'step.retrying';
  requestId: number;
  attempt: number;
  maxAttempts: number;
  errorClass: string;
  delayMs: number;
  error: string;
}

/** A fork returned a recorded result instead of running the step. */
export interface StepReplayedEvent extends ProgressBase {
  kind: 'step.replayed';
  requestId: number;
  originalRequestId: number;
  path: string;
  /** This step is the fork point. */
  boundary: boolean;
}

/** A step parked on an interrupt (prompt, approval, event wait); resume it with `conversation_resume`. */
export interface WaitOpenedEvent extends ProgressBase {
  kind: 'wait.opened';
  requestId: number;
  interrupt: CuratorInterrupt;
}

/** An interrupt was resumed. */
export interface WaitResumedEvent extends ProgressBase {
  kind: 'wait.resumed';
  requestId: number;
  interruptId: string;
  waitKind: InterruptKind;
  outcome: 'resumed' | 'denied';
}

/** Conversation state changed (writes made by workflow steps). */
export interface StateChangedEvent extends ProgressBase {
  kind: 'state.changed';
  /** The state event's id (`conversation_state_at` reads the state right after it). */
  stateSeq: number;
  scope: string | null;
  keys: string[];
}

/** A flow ended: its last step finished with nothing waiting on it. */
export interface RunFinishedEvent extends ProgressBase {
  kind: 'run.finished';
  requestId: number;
  status: StepStatus;
}

/** A conversation was forked from this one's step `atRequestId` (emitted for the new conversation). */
export interface RunForkedEvent extends ProgressBase {
  kind: 'run.forked';
  from: number;
  atRequestId: number;
  rootRequestId: number;
}

export type ProgressEvent =
  | StepStartedEvent
  | StepFinishedEvent
  | StepRetryingEvent
  | StepReplayedEvent
  | WaitOpenedEvent
  | WaitResumedEvent
  | StateChangedEvent
  | RunFinishedEvent
  | RunForkedEvent;

export type ProgressEventKind = ProgressEvent['kind'];

/** Distributes Omit over the union, so each kind keeps its own fields. */
type WithoutBase<T> = T extends any ? Omit<T, 'v' | 'seq' | 'ts'> : never;

/** A progress event as built by the processor, before `v`, `seq` and `ts` are stamped. */
export type ProgressEventInput = WithoutBase<ProgressEvent>;

/** True for a `curator:progress` payload this version understands (any kind: consumers ignore unknown kinds). */
export const isProgressEvent = (value: unknown): value is ProgressEvent =>
  !!value && typeof value === 'object' && (value as any).v === PROGRESS_EVENT_VERSION && typeof (value as any).kind === 'string';
