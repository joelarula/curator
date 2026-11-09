/**
 * Run timeline: one turn's `curator:progress` events folded into steps and a status, shared by the web console
 * (`useRunTimeline`) and the CLI (`ClientShell`). Pure and browser-safe.
 */
import type { ProgressEvent, StepStatus } from '@curator/agent-server';
import { describeProgressEvent, formatProgressDuration, progressStepLabel } from './progress.js';

/** State of one step (one Request) within a run. */
export type RunStepState = 'running' | 'retrying' | 'waiting' | StepStatus;

/** A tool call an agent step made (runs inside the step; `tool.started` / `tool.finished`). */
export interface RunToolCall {
  callId: string;
  toolName: string;
  label: string;
  state: 'running' | 'COMPLETED' | 'FAILED';
  durationMs: number | null;
}

export interface RunStep {
  requestId: number;
  nodeType: string | null;
  label: string;
  state: RunStepState;
  attempt: number;
  durationMs: number | null;
  replayed: boolean;
  /** Retry reason or wait prompt. */
  detail: string | null;
  startedAt: number;
  /** Tool calls made inside this step (agent steps). */
  calls: RunToolCall[];
}

export interface RunTimeline {
  /** The request the turn started (e.g. `triggerAgent` / `runTool` `requestId`); null when unknown (see binding). */
  rootRequestId: number | null;
  /**
   * The conversation the run follows. Learned from the root request's first event, or given up front; with neither,
   * the first `step.started` binds it.
   */
  conversationId: number | null;
  status: 'running' | 'waiting' | StepStatus;
  steps: RunStep[];
  startedAt: number;
  finishedAt: number | null;
  /** Latest status-line text (`describeProgressEvent`). */
  lastLine: string | null;
  /** False once the turn ended on the client (the timeline is then a record). */
  active: boolean;
}

export function createRunTimeline(
  target: { rootRequestId?: number | null; conversationId?: number | null } = {},
  now = Date.now()
): RunTimeline {
  return {
    rootRequestId: target.rootRequestId ?? null,
    conversationId: target.conversationId ?? null,
    status: 'running',
    steps: [],
    startedAt: now,
    finishedAt: null,
    lastLine: null,
    active: true,
  };
}

function stepFor(run: RunTimeline, requestId: number, ts: number): RunStep {
  let step = run.steps.find((s) => s.requestId === requestId);
  if (!step) {
    step = { requestId, nodeType: null, label: 'Step', state: 'running', attempt: 1, durationMs: null, replayed: false, detail: null, startedAt: ts, calls: [] };
    run.steps.push(step);
  }
  return step;
}

/**
 * Applies one progress event to a run. Returns false when the event belongs to another run, or has a kind this client
 * doesn't know (the contract says to ignore those).
 */
export function applyProgressEvent(run: RunTimeline, event: ProgressEvent): boolean {
  if (run.conversationId == null) {
    const binds = run.rootRequestId != null ? event.requestId === run.rootRequestId : event.kind === 'step.started';
    if (!binds) return false;
    run.conversationId = event.conversationId;
  } else if (event.conversationId !== run.conversationId) {
    return false;
  }

  switch (event.kind) {
    case 'step.started': {
      const step = stepFor(run, event.requestId, event.ts);
      step.nodeType = event.nodeType;
      step.label = progressStepLabel(event);
      step.state = 'running';
      step.attempt = event.attempt;
      step.detail = null;
      run.status = 'running';
      run.finishedAt = null;
      break;
    }
    case 'step.finished': {
      const step = stepFor(run, event.requestId, event.ts);
      if (event.nodeType) {
        step.nodeType = event.nodeType;
        step.label = progressStepLabel(event);
      }
      step.state = event.status;
      step.durationMs = event.durationMs;
      // A call cut short (approval pause, crash) ends with its step
      for (const call of step.calls) if (call.state === 'running') call.state = event.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
      break;
    }
    case 'tool.started': {
      const step = stepFor(run, event.requestId, event.ts);
      const call = step.calls.find((c) => c.callId === event.callId);
      const label = event.label || event.toolName;
      if (call) Object.assign(call, { state: 'running', label, durationMs: null });
      else step.calls.push({ callId: event.callId, toolName: event.toolName, label, state: 'running', durationMs: null });
      break;
    }
    case 'tool.finished': {
      const step = stepFor(run, event.requestId, event.ts);
      let call = step.calls.find((c) => c.callId === event.callId);
      if (!call) {
        call = { callId: event.callId, toolName: event.toolName, label: event.label || event.toolName, state: 'running', durationMs: null };
        step.calls.push(call);
      }
      call.state = event.status;
      call.durationMs = event.durationMs;
      break;
    }
    case 'step.retrying': {
      const step = stepFor(run, event.requestId, event.ts);
      step.state = 'retrying';
      step.attempt = event.attempt;
      step.detail = `${event.errorClass}: ${event.error}`;
      break;
    }
    case 'step.replayed': {
      const step = stepFor(run, event.requestId, event.ts);
      step.replayed = true;
      step.state = 'COMPLETED';
      break;
    }
    case 'wait.opened': {
      const step = stepFor(run, event.requestId, event.ts);
      step.state = 'waiting';
      step.detail = event.interrupt?.prompt ?? null;
      run.status = 'waiting';
      break;
    }
    case 'wait.resumed': {
      const step = stepFor(run, event.requestId, event.ts);
      step.state = 'running';
      step.detail = null;
      run.status = 'running';
      break;
    }
    case 'run.finished':
      run.status = event.status;
      run.finishedAt = event.ts;
      break;
    case 'state.changed':
    case 'run.forked':
      break;
    default:
      return false;
  }

  const line = describeProgressEvent(event);
  if (line) run.lastLine = line;
  return true;
}

/** True once the run reached a final status (not running or waiting). */
export function isRunDone(run: RunTimeline): boolean {
  return run.status !== 'running' && run.status !== 'waiting';
}

/** Wall time of the run so far: until `run.finished`, else until the last finished step. */
export function runDurationMs(run: RunTimeline, now = Date.now()): number | null {
  if (run.finishedAt != null) return run.finishedAt - run.startedAt;
  if (run.active) return now - run.startedAt;
  const lastEnd = run.steps.reduce((t, s) => Math.max(t, s.startedAt + (s.durationMs ?? 0)), 0);
  return lastEnd ? lastEnd - run.startedAt : null;
}

/**
 * One-line summary, e.g. "Agent completed · 3 steps · 2.1 s". Finished: the first step's label + final status;
 * waiting or running: the latest status line.
 */
export function summarizeRun(run: RunTimeline, now = Date.now()): string {
  const status = String(run.status).toLowerCase();
  const headline = isRunDone(run)
    ? `${run.steps[0]?.label ?? 'Run'} ${status}`
    : run.status === 'waiting'
      ? run.lastLine ?? 'Waiting for input'
      : run.lastLine ?? 'Starting…';
  const steps = `${run.steps.length} ${run.steps.length === 1 ? 'step' : 'steps'}`;
  const took = formatProgressDuration(runDurationMs(run, now));
  return [headline, steps, took].filter(Boolean).join(' · ');
}
