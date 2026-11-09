import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { PROGRESS_EVENT, isProgressEvent, type ProgressEvent } from '../../src/engine/ProgressEvents.ts';

const tool = (name: string, extra: any = {}) => ({ type: 'Curator_Tool', toolName: name, args: {}, ...extra });

/** An env whose processor records its progress events. */
async function envWithProgress(name: string, canned: Record<string, any>, options: Record<string, any> = {}) {
  const events: ProgressEvent[] = [];
  const env = await createEnv(name, canned, {
    ...options,
    onEvent: (type: string, payload: any) => { if (type === PROGRESS_EVENT && isProgressEvent(payload)) events.push(payload); },
  });
  return { env, events };
}

const kinds = (events: ProgressEvent[]) => events.map((e) => e.kind);

test('progress: a flow reports its steps, state changes and its end, in order', async () => {
  const { env, events } = await envWithProgress('pg_flow', { a: () => ({ x: 1 }), b: () => ({ y: 2 }) });
  try {
    await runAst(env, { type: 'Curator_Sequential', subAgents: [tool('a'), tool('b')] });
    assert.ok(events.every((e) => e.v === 1 && e.conversationId === env.conversationId));
    assert.deepEqual(events.map((e) => e.seq), events.map((_, i) => events[0].seq + i), 'seq increases by one');

    const started = events.filter((e) => e.kind === 'step.started') as any[];
    assert.deepEqual(started.map((e) => e.nodeType), ['Curator_Sequential', 'Curator_Tool', 'Curator_Tool']);
    assert.ok(started.every((e) => e.attempt === 1));
    const finished = events.filter((e) => e.kind === 'step.finished') as any[];
    assert.equal(finished.length, 3);
    assert.ok(finished.every((e) => e.status === 'COMPLETED'));

    const changed = events.filter((e) => e.kind === 'state.changed') as any[];
    assert.ok(changed.some((e) => e.keys.includes('x') && typeof e.stateSeq === 'number'), "a's output reached state");

    const runs = events.filter((e) => e.kind === 'run.finished') as any[];
    assert.equal(runs.length, 1, 'one flow, one end (hand-overs are not ends)');
    assert.equal(runs[0].status, 'COMPLETED');
    assert.equal(kinds(events).at(-1), 'run.finished');
  } finally {
    await env.cleanup();
  }
});

test('progress: waits open and resume on the stream', async () => {
  const { env, events } = await envWithProgress('pg_wait', {});
  try {
    const { requestId } = await runAst(env, { type: 'Curator_HumanInput', prompt: 'Name?', inputType: 'text', as: 'name' });
    const opened = events.find((e) => e.kind === 'wait.opened') as any;
    assert.equal(opened.requestId, requestId);
    assert.equal(opened.interrupt.kind, 'human_input');
    assert.equal(opened.interrupt.id, `${requestId}.1`);

    await env.processor.resumeInterrupt({ interruptId: opened.interrupt.id, value: 'Ada', userId: env.userId, projectIds: [] });
    await env.processor.stepUntil({ conversationId: env.conversationId });
    const resumed = events.find((e) => e.kind === 'wait.resumed') as any;
    assert.deepEqual([resumed.interruptId, resumed.waitKind, resumed.outcome], [opened.interrupt.id, 'human_input', 'resumed']);
    assert.ok(kinds(events).indexOf('wait.resumed') < kinds(events).lastIndexOf('run.finished'));
  } finally {
    await env.cleanup();
  }
});

test('progress: retries and failures are reported with their attempt', async () => {
  let now = Date.UTC(2100, 0, 1);
  let failures = 1;
  const { env, events } = await envWithProgress('pg_retry', {
    flaky: () => { if (failures-- > 0) throw new Error('ECONNRESET'); return { ok: true }; },
    broken: () => { throw new Error('bad input'); },
  }, { now: () => now });
  try {
    await runAst(env, tool('flaky', { retry: { maxAttempts: 2, backoff: { initialMs: 10, jitter: false } } }));
    const retrying = events.find((e) => e.kind === 'step.retrying') as any;
    assert.deepEqual([retrying.attempt, retrying.maxAttempts, retrying.errorClass, retrying.delayMs], [1, 2, 'transient', 10]);
    now += 10;
    await env.processor.stepUntil({ conversationId: env.conversationId });
    const attempts = (events.filter((e) => e.kind === 'step.started') as any[]).map((e) => e.attempt);
    assert.deepEqual(attempts, [1, 2]);

    events.length = 0;
    await runAst(env, tool('broken', { retry: { maxAttempts: 1 } }));
    const finished = events.find((e) => e.kind === 'step.finished') as any;
    assert.equal(finished.status, 'FAILED');
    assert.equal((events.find((e) => e.kind === 'run.finished') as any).status, 'FAILED');
  } finally {
    await env.cleanup();
  }
});

test('progress: isProgressEvent accepts any kind of this version', () => {
  assert.equal(isProgressEvent({ v: 1, kind: 'something.new' }), true, 'unknown kinds are still progress events (ignore them)');
  assert.equal(isProgressEvent({ v: 2, kind: 'step.started' }), false);
  assert.equal(isProgressEvent(null), false);
});
