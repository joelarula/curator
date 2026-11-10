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

test('progress: step events carry labels from definitions, never from arguments', async () => {
  const { env, events } = await envWithProgress('pg_labels', { lookup: () => 'ok', search: () => 'ok' });
  try {
    const search = (env.processor as any).engine.tools.get('search');
    search.ui = { progressLabel: 'Searching the knowledge base' };
    await runAst(env, {
      type: 'Curator_Sequential',
      name: 'Find answers',
      subAgents: [tool('lookup', { args: { secret: 'p@ss' } }), tool('search'), tool('lookup', { name: 'Second lookup' })],
    });
    const started = events.filter((e) => e.kind === 'step.started') as any[];
    assert.deepEqual(started.map((e) => e.label), ['Find answers', 'lookup', 'Searching the knowledge base', 'Second lookup']);
    const finished = events.filter((e) => e.kind === 'step.finished') as any[];
    assert.deepEqual(finished.map((e) => e.label).sort(), started.map((e) => e.label).sort(), 'finished repeats the label');
    assert.ok(!JSON.stringify(events).includes('p@ss'), 'argument values never appear in progress events');
  } finally {
    await env.cleanup();
  }
});

test('progress: tool calls inside an agent step report tool.started / tool.finished', async () => {
  const { env, events } = await envWithProgress('pg_agent_tools', { lookup: () => ({ temp: 21 }) });
  try {
    env.useLlm([
      { toolCalls: [{ name: 'lookup', args: { city: 'Tartu' } }, { name: 'nope', args: {} }] },
      'done',
    ]);
    const { requestId } = await runAst(env, { type: 'Curator_Agent', agentName: 'weather', model: 'fake-model', prompt: 'hi', tools: ['lookup', 'nope'] });
    const agentStart = events.find((e) => e.kind === 'step.started') as any;
    assert.equal(agentStart.label, 'weather');

    const calls = events.filter((e) => e.kind === 'tool.started' || e.kind === 'tool.finished') as any[];
    assert.deepEqual(
      calls.map((e) => [e.kind, e.toolName, e.status ?? null]),
      [
        ['tool.started', 'lookup', null],
        ['tool.finished', 'lookup', 'COMPLETED'],
        ['tool.started', 'nope', null],
        ['tool.finished', 'nope', 'FAILED'],
      ]
    );
    assert.equal(calls[0].callId, calls[1].callId, 'started and finished share the call id');
    assert.notEqual(calls[0].callId, calls[2].callId);
    assert.ok(calls.every((e) => e.requestId === requestId && e.conversationId === env.conversationId));
    assert.ok(calls.filter((e) => e.kind === 'tool.finished').every((e) => typeof e.durationMs === 'number'));
    const kindsSeen = kinds(events);
    assert.ok(kindsSeen.indexOf('tool.finished') < kindsSeen.indexOf('step.finished'), 'calls end before the agent step');
  } finally {
    await env.cleanup();
  }
});

test('progress: an agent step is labelled with the agent presentation title, else its name', async () => {
  const { stepProgressLabel } = await import('../../src/engine/progressLabel.ts');
  const agents = new Map<string, any>([['weather', { presentation: { title: 'Weather assistant' } }], ['plain', {}]]);
  const none = () => undefined;
  assert.equal(stepProgressLabel({ type: 'Curator_Agent', agentName: 'weather' }, none, (n) => agents.get(n)), 'Weather assistant');
  assert.equal(stepProgressLabel({ type: 'Curator_Agent', agentName: 'plain' }, none, (n) => agents.get(n)), 'plain');
  assert.equal(stepProgressLabel({ type: 'Curator_Agent', agentName: 'weather' }, none), 'weather');
  assert.equal(stepProgressLabel({ type: 'Curator_Agent', agentName: 'weather', name: 'Ask' }, none, (n) => agents.get(n)), 'Ask');
});
