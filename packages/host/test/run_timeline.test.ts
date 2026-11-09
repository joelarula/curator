import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProgressEvent, createRunTimeline, summarizeRun } from '../dist/contracts/runTimeline.js';
import { progressStepLabel } from '../dist/contracts/progress.js';
import { ShellProgressRenderer } from '../dist/cli/progressRenderer.js';

let seq = 0;
const ev = (e: Record<string, any>) => ({ v: 1, seq: ++seq, ts: 1000 + seq * 100, conversationId: 42, ...e }) as any;

test('a run binds to its root request, then follows that conversation only', () => {
  const run = createRunTimeline({ rootRequestId: 10 }, 1000);
  assert.equal(applyProgressEvent(run, ev({ kind: 'step.started', requestId: 99, nodeType: 'Curator_Agent', attempt: 1, conversationId: 5 })), false);
  assert.equal(applyProgressEvent(run, ev({ kind: 'step.started', requestId: 10, nodeType: 'Curator_Agent', attempt: 1 })), true);
  assert.equal(run.conversationId, 42);
  assert.equal(applyProgressEvent(run, ev({ kind: 'step.started', requestId: 12, nodeType: 'Curator_Tool', attempt: 1, conversationId: 7 })), false);
});

test('without a root request, the first step.started binds the run', () => {
  const run = createRunTimeline({}, 1000);
  assert.equal(applyProgressEvent(run, ev({ kind: 'step.finished', requestId: 1, nodeType: 'Curator_Tool', status: 'COMPLETED', durationMs: 1 })), false);
  assert.equal(applyProgressEvent(run, ev({ kind: 'step.started', requestId: 2, nodeType: 'Curator_Tool', attempt: 1, conversationId: 9 })), true);
  assert.equal(run.conversationId, 9);
});

test('folds retries, waits, replay and the end; summary line', () => {
  const run = createRunTimeline({ rootRequestId: 10 }, 1000);
  applyProgressEvent(run, ev({ kind: 'step.started', requestId: 10, nodeType: 'Curator_Agent', attempt: 1 }));
  applyProgressEvent(run, ev({ kind: 'step.retrying', requestId: 10, attempt: 2, maxAttempts: 3, errorClass: 'rate_limit', delayMs: 500, error: '429' }));
  assert.equal(run.steps[0].state, 'retrying');
  assert.equal(run.steps[0].detail, 'rate_limit: 429');
  applyProgressEvent(run, ev({ kind: 'step.finished', requestId: 10, nodeType: 'Curator_Agent', status: 'COMPLETED', durationMs: 1200 }));
  applyProgressEvent(run, ev({ kind: 'wait.opened', requestId: 11, interrupt: { kind: 'human_input', prompt: 'Pick' } }));
  assert.equal(run.status, 'waiting');
  applyProgressEvent(run, ev({ kind: 'wait.resumed', requestId: 11, interruptId: '11.1', waitKind: 'human_input', outcome: 'resumed' }));
  applyProgressEvent(run, ev({ kind: 'step.replayed', requestId: 12, originalRequestId: 3, path: '0', boundary: false }));
  assert.equal(run.steps.find((s) => s.requestId === 12)?.replayed, true);
  applyProgressEvent(run, ev({ kind: 'run.finished', requestId: 11, status: 'COMPLETED' }));
  assert.equal(run.status, 'COMPLETED');
  run.active = false;
  assert.match(summarizeRun(run), /^Agent completed · 3 steps · \d+(\.\d)? s$/);
  assert.equal(applyProgressEvent(run, ev({ kind: 'some.future.kind' })), false);
});

test('step labels prefer an event label over the node type', () => {
  assert.equal(progressStepLabel({ nodeType: 'Curator_Tool', label: 'search_knowledge' }), 'search_knowledge');
  assert.equal(progressStepLabel({ nodeType: 'Curator_Tool', label: '  ' }), 'Tool');
  assert.equal(progressStepLabel({ nodeType: 'Curator_Tool' }), 'Tool');
});

function fakeIo(opts: { tty: boolean; atPrompt: boolean }) {
  const printed: string[] = [];
  const written: string[] = [];
  const io = {
    isTTY: () => opts.tty,
    atPrompt: () => opts.atPrompt,
    printAsync: (...lines: string[]) => printed.push(...lines),
    write: (text: string) => written.push(text),
  };
  return { io, printed, written };
}
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

test('CLI renderer: live line while handling a line on a TTY, summary at the end', () => {
  const { io, printed, written } = fakeIo({ tty: true, atPrompt: false });
  const r = new ShellProgressRenderer(io);
  r.ingest(ev({ kind: 'step.started', requestId: 1, nodeType: 'Curator_Tool', attempt: 1 }));
  r.ingest(ev({ kind: 'step.finished', requestId: 1, nodeType: 'Curator_Tool', status: 'COMPLETED', durationMs: 5 }));
  assert.ok(written.some((w) => plain(w).includes('Tool completed · 5 ms')));
  assert.equal(printed.length, 0);
  r.ingest(ev({ kind: 'run.finished', requestId: 1, status: 'COMPLETED' }));
  assert.equal(printed.length, 1);
  assert.match(plain(printed[0]), /^✔ Tool completed · 1 step · /);
  assert.equal(written.at(-1), '\r\x1b[2K');
  r.dispose();
});

test('CLI renderer: at the prompt (or without a TTY) it prints step lines, and waits as permanent lines', () => {
  const { io, printed, written } = fakeIo({ tty: true, atPrompt: true });
  const r = new ShellProgressRenderer(io);
  r.ingest(ev({ kind: 'step.started', requestId: 1, nodeType: 'Curator_Agent', attempt: 1 }));
  r.ingest(ev({ kind: 'step.finished', requestId: 1, nodeType: 'Curator_Agent', status: 'COMPLETED', durationMs: 1500 }));
  r.ingest(ev({ kind: 'wait.opened', requestId: 2, interrupt: { kind: 'approval', prompt: 'Run delete?' } }));
  assert.deepEqual(printed.map(plain), ['  · Agent completed · 1.5 s', '⏸ Waiting for approval: Run delete?']);
  assert.equal(written.length, 0);
  r.dispose();
});

test('CLI renderer: conversation filter and verbose mode', () => {
  const { io, printed } = fakeIo({ tty: false, atPrompt: false });
  const r = new ShellProgressRenderer(io, { verbose: true, conversationId: 42 });
  r.ingest(ev({ kind: 'step.started', requestId: 1, nodeType: 'Curator_Tool', attempt: 1, conversationId: 7 }));
  r.ingest(ev({ kind: 'step.started', requestId: 2, nodeType: 'Curator_Tool', attempt: 1 }));
  assert.deepEqual(printed.map(plain), ['  · Tool started']);
  r.dispose();
});
