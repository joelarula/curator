/**
 * CLI rendering of `curator:progress`, matching the web console's run status: a live status line while a run is
 * going (TTY, prompt not showing), one summary line when it ends ("✔ Agent completed · 3 steps · 2.1 s").
 * While the prompt is showing (a run started by an agent after the user's message) or without a TTY, it prints one
 * dim line per finished/retried/waiting step instead of rewriting a line under the user's typing.
 */
import {
  applyProgressEvent,
  createRunTimeline,
  isRunDone,
  summarizeRun,
  type RunTimeline,
} from '../contracts/runTimeline.js';
import { describeProgressEvent, isProgressEventPayload, type ProgressEvent } from '../contracts/progress.js';

export interface ShellProgressOptions {
  /** Print every event's line (including `step.started`) instead of the live line + summary. */
  verbose?: boolean;
  /** Only follow this conversation (default: the first conversation a step starts in, per run). */
  conversationId?: number | null;
  /** Close a run whose engine never sends `run.finished` after this long without events (ms, default 15000). */
  idleMs?: number;
}

export interface ShellProgressIo {
  isTTY(): boolean;
  /** The readline prompt is showing (the user may be typing). */
  atPrompt(): boolean;
  /** Prints lines above the prompt (ClientShell.printAsync). */
  printAsync(...lines: string[]): void;
  /** Raw write to the terminal (live line). */
  write(text: string): void;
}

const DIM = '\x1b[90m';
const RESET = '\x1b[0m';
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
/** Kinds printed as lines when the live line can't be used. */
const LINE_KINDS = new Set(['step.finished', 'tool.finished', 'step.retrying', 'step.replayed', 'wait.opened', 'wait.resumed']);

export class ShellProgressRenderer {
  private run: RunTimeline | null = null;
  private liveShown = false;
  private frame = 0;
  private spinTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly io: ShellProgressIo, private readonly options: ShellProgressOptions = {}) {}

  /** Handles a channel payload; returns the event's status line (or null when it isn't a progress event / has none). */
  ingest(payload: unknown): string | null {
    if (!isProgressEventPayload(payload)) return null;
    const event = payload as ProgressEvent;
    const line = describeProgressEvent(event);
    if (this.options.conversationId != null && event.conversationId !== this.options.conversationId) return line;

    if (!this.run || !this.run.active) {
      if (event.kind !== 'step.started') return line; // runs open on their first step
      this.run = createRunTimeline({ conversationId: event.conversationId });
    }
    if (!applyProgressEvent(this.run, event)) return line;

    if (this.options.verbose) {
      if (line) this.printLine(`${DIM}  · ${line}${RESET}`);
    } else if (event.kind === 'wait.opened') {
      // The user has to answer: make it a permanent line, not a transient one
      this.printLine(`\x1b[33m⏸ ${line}${RESET}`);
    } else if (this.canShowLive()) {
      this.drawLive();
    } else if (line && LINE_KINDS.has(event.kind)) {
      this.printLine(`${DIM}  · ${line}${RESET}`);
    }

    if (event.kind === 'run.finished') this.finish();
    else this.armIdle();
    return line;
  }

  /** Call before the prompt is redrawn: a live line would collide with it, so it is cleared (events then print lines). */
  detachLive(): void {
    this.clearLive();
  }

  /** Call around other output while a live line may be showing. */
  suspend(): boolean {
    const was = this.liveShown;
    this.clearLive();
    return was;
  }

  resume(wasShown: boolean): void {
    if (wasShown && this.run?.active && this.canShowLive()) this.drawLive();
  }

  dispose(): void {
    this.clearLive();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.run = null;
  }

  /** The run being followed (for tests and status commands). */
  get current(): RunTimeline | null {
    return this.run;
  }

  private canShowLive(): boolean {
    return this.io.isTTY() && !this.io.atPrompt();
  }

  private drawLive(): void {
    if (!this.run) return;
    const glyph = this.run.status === 'waiting' ? '⏸' : SPINNER[this.frame % SPINNER.length];
    this.io.write(`\r\x1b[2K${DIM}${glyph} ${summarizeRun(this.run)}${RESET}`);
    this.liveShown = true;
    if (!this.spinTimer) {
      this.spinTimer = setInterval(() => {
        this.frame++;
        if (this.liveShown && this.run?.active && this.canShowLive()) this.drawLive();
      }, 120);
      (this.spinTimer as any).unref?.();
    }
  }

  private clearLive(): void {
    if (this.spinTimer) clearInterval(this.spinTimer);
    this.spinTimer = null;
    if (this.liveShown) this.io.write('\r\x1b[2K');
    this.liveShown = false;
  }

  private printLine(text: string): void {
    const was = this.suspend();
    this.io.printAsync(text);
    this.resume(was);
  }

  private finish(): void {
    const run = this.run;
    if (!run) return;
    run.active = false;
    this.clearLive();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (run.steps.length === 0) return;
    const ok = run.status === 'COMPLETED';
    const mark = ok ? '\x1b[32m✔' : run.status === 'FAILED' ? '\x1b[31m✖' : '\x1b[33m•';
    this.io.printAsync(`${mark} ${summarizeRun(run)}${RESET}`);
  }

  private armIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const run = this.run;
    if (!run || run.status === 'waiting') return;
    this.idleTimer = setTimeout(() => {
      // No run.finished (older engine or a lost event): close once nothing is running
      if (this.run === run && run.active && !run.steps.some((s) => s.state === 'running' || s.state === 'retrying')) {
        if (!isRunDone(run)) run.status = run.steps.some((s) => s.state === 'FAILED') ? 'FAILED' : 'COMPLETED';
        this.finish();
      }
    }, this.options.idleMs ?? 15000);
    (this.idleTimer as any).unref?.();
  }
}
