/**
 * Progress stream contract: the typed events a Curator processor publishes as `curator:progress` (host events and
 * the WebSocket stream), plus pure helpers for clients (guard, status-line text). No engine import at runtime, so it
 * is safe in browsers. Follow the stream with `host.events.onProgress(...)`. Consumers must ignore kinds they do not
 * know (new kinds can appear within a version).
 */
import type { ProgressEvent } from '@curator/agent-server';

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
  ToolStartedEvent,
  ToolFinishedEvent,
  CuratorInterrupt,
} from '@curator/agent-server';

/** Event type of the progress stream on host events / the WebSocket stream. */
export const PROGRESS_EVENT_TYPE = 'curator:progress' as const;

/**
 * True for a `curator:progress` payload of the version this contract describes. Same check as the engine's
 * `isProgressEvent`, without importing the engine (safe in browsers). Any `kind` passes: consumers ignore unknown ones.
 */
export function isProgressEventPayload(value: unknown): value is ProgressEvent {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as any).v === 1 &&
    typeof (value as any).kind === 'string' &&
    typeof (value as any).conversationId === 'number'
  );
}

/** `Curator_Agent` → `Agent`; plugin node types are shown as they are. */
export function progressNodeLabel(nodeType: string | null | undefined): string {
  if (!nodeType) return 'Step';
  return nodeType.startsWith('Curator_') ? nodeType.slice('Curator_'.length) : nodeType;
}

/**
 * Display label of a step event: the event's `label` when the engine sends one (planned: node `name`, tool/agent
 * name), otherwise the node type.
 */
export function progressStepLabel(event: { nodeType?: string | null; label?: unknown }): string {
  return typeof event.label === 'string' && event.label.trim() ? event.label.trim() : progressNodeLabel(event.nodeType);
}

/** `850` → `850 ms`, `1234` → `1.2 s`. */
export function formatProgressDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/**
 * One-line, plain-text description of a progress event for status lines (console and CLI). Returns null for kinds
 * that don't deserve a line (`state.changed`, unknown kinds).
 */
export function describeProgressEvent(event: ProgressEvent): string | null {
  switch (event.kind) {
    case 'step.started':
      return `${progressStepLabel(event)} started${event.attempt > 1 ? ` (attempt ${event.attempt})` : ''}`;
    case 'step.finished': {
      const took = formatProgressDuration(event.durationMs);
      return `${progressStepLabel(event)} ${event.status.toLowerCase()}${took ? ` · ${took}` : ''}`;
    }
    case 'step.retrying':
      return `Retrying ${event.attempt}/${event.maxAttempts} (${event.errorClass}) in ${formatProgressDuration(event.delayMs)}`;
    case 'step.replayed':
      return `Replayed recorded step #${event.originalRequestId}${event.boundary ? ' (fork point)' : ''}`;
    case 'wait.opened': {
      const kind = event.interrupt?.kind === 'human_input' ? 'input' : event.interrupt?.kind ?? 'input';
      return `Waiting for ${kind}${event.interrupt?.prompt ? `: ${event.interrupt.prompt}` : ''}`;
    }
    case 'wait.resumed':
      return event.outcome === 'denied' ? 'Denied, continuing' : 'Resumed';
    case 'run.finished':
      return `Run ${event.status.toLowerCase()}`;
    case 'run.forked':
      return `Forked from conversation #${event.from} at step #${event.atRequestId}`;
    case 'tool.started':
      return `${event.label || event.toolName} started`;
    case 'tool.finished': {
      const took = formatProgressDuration(event.durationMs);
      return `${event.label || event.toolName} ${event.status.toLowerCase()}${took ? ` · ${took}` : ''}`;
    }
    default:
      return null;
  }
}
