/**
 * Progress stream contract: the typed events a Curator processor publishes as `curator:progress` (host events and
 * the WebSocket stream). Types only; follow them with `host.events.onProgress(...)`. Consumers must ignore kinds
 * they do not know (new kinds can appear within a version).
 */
export type {
  ProgressEvent,
  ProgressEventKind,
  StepStatus,
  StepStartedEvent,
  StepFinishedEvent,
  StepRetryingEvent,
  StepReplayedEvent,
  WaitOpenedEvent,
  WaitResumedEvent,
  StateChangedEvent,
  RunFinishedEvent,
  RunForkedEvent,
  CuratorInterrupt,
} from '@curator/agent-server';

/** Event type of the progress stream on host events / the WebSocket stream. */
export const PROGRESS_EVENT_TYPE = 'curator:progress' as const;
