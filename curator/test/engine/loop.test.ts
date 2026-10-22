import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, snapshotDb, assertGolden, FIXED_NOW } from '../helpers/harness.ts';
import { validateCuratorAst, AST_LIMITS } from '../../src/engine/CuratorAstValidation.js';
import { isValidSchedule } from '../../src/engine/CuratorRequestProcessor.js';

const tick = (extra: any = {}) => ({ type: 'Curator_Tool', toolName: 'tick', args: { n: '$context.iteration' }, ...extra });
const loop = (extra: any = {}) => ({ type: 'Curator_Loop', agent: tick(), ...extra });
const canned = { tick: (a: any) => a.n };
const status = async (env: any, id: number) => (await env.prisma.request.findUnique({ where: { id } })).status;
const MIN = 60_000;

test('loop: runs the body up to maxIterations with a 1-based $context.iteration', async () => {
  const env = await createEnv('loop_max', canned);
  try {
    const { requestId, result } = await runAst(env, loop({ maxIterations: 3 }));
    assert.equal(result.done, true);
    assert.equal(await status(env, requestId), 'COMPLETED');
    assert.deepEqual(env.calls.map((c) => c.args.n), [1, 2, 3]);
    const finished = (await env.prisma.response.findMany({ where: { requestId } })).map((r: any) => r.content);
    assert.deepEqual(finished, ['Loop finished after 3 iteration(s) (maxIterations).']);
    assertGolden('loop/max_iterations.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});

test('loop: `until` stops after the iteration that satisfies it', async () => {
  const env = await createEnv('loop_until', canned);
  try {
    const { requestId } = await runAst(env, loop({ maxIterations: 10, until: '$context.iteration >= 2' }));
    assert.equal(await status(env, requestId), 'COMPLETED');
    assert.deepEqual(env.calls.map((c) => c.args.n), [1, 2]);
    const [res] = await env.prisma.response.findMany({ where: { requestId } });
    assert.match(res.content, /after 2 iteration\(s\) \(until\)/);
  } finally {
    await env.cleanup();
  }
});

test('loop: `over` iterates a collection binding the item and index; empty collections run nothing', async () => {
  const env = await createEnv('loop_over', { tick: (a: any) => a.n });
  try {
    const body = { type: 'Curator_Tool', toolName: 'tick', args: { n: '$context.letter' } };
    const { requestId } = await runAst(env, { type: 'Curator_Sequential', name: 's', subAgents: [
      { type: 'Curator_SetState', state: { letters: ['a', 'b', 'c'], none: [] } },
      { type: 'Curator_Loop', over: '$state.letters', as: 'letter', agent: body },
      { type: 'Curator_Loop', over: '$state.none', as: 'letter', agent: body },
    ] });
    assert.equal(await status(env, requestId), 'COMPLETED');
    assert.deepEqual(env.calls.map((c) => c.args.n), ['a', 'b', 'c']);
    const finished = (await env.prisma.response.findMany()).map((r: any) => r.content).filter((c: string) => c.startsWith('Loop finished'));
    assert.deepEqual(finished.sort(), ['Loop finished after 0 iteration(s) (over).', 'Loop finished after 3 iteration(s) (over).']);
  } finally {
    await env.cleanup();
  }
});

test('loop: `over` that is not an array fails the request', async () => {
  const env = await createEnv('loop_over_bad', canned);
  try {
    const { requestId } = await runAst(env, loop({ over: '42' }));
    assert.equal(await status(env, requestId), 'FAILED');
    assert.equal(env.calls.length, 0);
  } finally {
    await env.cleanup();
  }
});

test('loop: `while` is checked before every iteration, including the first', async () => {
  const env = await createEnv('loop_while', canned);
  try {
    const never = await runAst(env, loop({ while: '$context.iteration < 0' }));
    assert.equal(await status(env, never.requestId), 'COMPLETED');
    assert.equal(env.calls.length, 0);
    await runAst(env, loop({ while: '$context.iteration < 2' }));
    assert.deepEqual(env.calls.map((c) => c.args.n), [1, 2]);
  } finally {
    await env.cleanup();
  }
});

test('loop schedule + over: one collection item per scheduled slot', async () => {
  let now = FIXED_NOW;
  const env = await createEnv('loop_sched_over', { tick: (a: any) => a.n }, { now: () => now });
  try {
    const body = { type: 'Curator_Tool', toolName: 'tick', args: { n: '$context.item' } };
    const { requestId } = await runAst(env, { type: 'Curator_Loop', schedule: 'every 1 minute', over: '["x","y"]', agent: body });
    for (let i = 1; i <= 2; i++) {
      now = FIXED_NOW + i * MIN;
      await env.processor.stepUntil({ conversationId: env.conversationId });
    }
    assert.deepEqual(env.calls.map((c) => c.args.n), ['x', 'y']);
    assert.equal(await status(env, requestId), 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

test('loop: nested loops keep independent iteration counters', async () => {
  const env = await createEnv('loop_nested', { tick: (a: any) => a.n });
  try {
    const inner = { type: 'Curator_Loop', maxIterations: 2, agent: { type: 'Curator_Tool', toolName: 'tick', args: { n: '$context.iteration' } } };
    const { requestId } = await runAst(env, { type: 'Curator_Loop', maxIterations: 2, agent: inner });
    assert.equal(await status(env, requestId), 'COMPLETED');
    assert.deepEqual(env.calls.map((c) => c.args.n), [1, 2, 1, 2]);
  } finally {
    await env.cleanup();
  }
});

test('loop: `prompt` is inherited by a body without one', async () => {
  const env = await createEnv('loop_prompt');
  try {
    const llm = env.useLlm(['one', 'two']);
    const body = { type: 'Curator_Agent', agentName: 'a', model: 'm' };
    await runAst(env, { type: 'Curator_Loop', maxIterations: 2, prompt: 'say hi', agent: body });
    assert.equal(llm.requests.length, 2);
    for (const r of llm.requests) assert.ok(JSON.stringify(r.messages).includes('say hi'));
  } finally {
    await env.cleanup();
  }
});

// ---- Scheduler subtype ----

test('loop schedule: each iteration is queued for the next due time on the injected clock', async () => {
  let now = FIXED_NOW;
  const env = await createEnv('loop_sched', canned, { now: () => now });
  try {
    const { requestId } = await runAst(env, loop({ schedule: 'every 5 minutes', maxIterations: 2 }));
    assert.equal(env.calls.length, 0, 'first iteration waits for its slot');
    let pending = await env.prisma.request.findMany({ where: { conversationId: env.conversationId, status: 'NEW' } });
    assert.equal(pending.length, 1);
    assert.equal(pending[0].scheduledAt.getTime(), FIXED_NOW + 5 * MIN);

    now = FIXED_NOW + 4 * MIN;
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(env.calls.length, 0, 'not due yet');

    now = FIXED_NOW + 5 * MIN;
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.deepEqual(env.calls.map((c) => c.args.n), [1]);
    pending = await env.prisma.request.findMany({ where: { conversationId: env.conversationId, status: 'NEW' } });
    assert.equal(pending[0].scheduledAt.getTime(), FIXED_NOW + 10 * MIN);
    assert.notEqual(await status(env, requestId), 'COMPLETED');

    now = FIXED_NOW + 10 * MIN;
    const { done } = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(done, true);
    assert.deepEqual(env.calls.map((c) => c.args.n), [1, 2]);
    assert.equal(await status(env, requestId), 'COMPLETED');
    assertGolden('loop/scheduled.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});

test('loop schedule: `immediate` runs the first iteration now, the rest on schedule', async () => {
  let now = FIXED_NOW;
  const env = await createEnv('loop_imm', canned, { now: () => now });
  try {
    await runAst(env, loop({ schedule: 'every 5 minutes', maxIterations: 2, immediate: true }));
    assert.deepEqual(env.calls.map((c) => c.args.n), [1]);
    now = FIXED_NOW + 5 * MIN;
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.deepEqual(env.calls.map((c) => c.args.n), [1, 2]);
  } finally {
    await env.cleanup();
  }
});

test('loop schedule: unbounded loops keep rescheduling until `until` is met', async () => {
  let now = FIXED_NOW;
  const env = await createEnv('loop_unbounded', canned, { now: () => now });
  try {
    const { requestId } = await runAst(env, loop({ schedule: 'every 1 minute', until: '$context.iteration >= 3', immediate: true }));
    for (let i = 1; i <= 3; i++) {
      now = FIXED_NOW + i * MIN;
      await env.processor.stepUntil({ conversationId: env.conversationId });
    }
    assert.deepEqual(env.calls.map((c) => c.args.n), [1, 2, 3]);
    assert.equal(await status(env, requestId), 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

test('loop schedule: an invalid schedule fails the request without running the body', async () => {
  const env = await createEnv('loop_badsched', canned);
  try {
    const { requestId } = await runAst(env, loop({ schedule: 'whenever', maxIterations: 1 }));
    assert.equal(await status(env, requestId), 'FAILED');
    assert.equal(env.calls.length, 0);
  } finally {
    await env.cleanup();
  }
});

test('isValidSchedule: cron, intervals and at-times', () => {
  for (const ok of ['0 14 * * 1-5', 'every 10 minutes', 'every hour', 'at 14:00', 'at 2:30 pm']) assert.equal(isValidSchedule(ok), true, ok);
  for (const bad of ['', 'whenever', 'every banana', 'at noon', '* * *']) assert.equal(isValidSchedule(bad), false, bad);
});

test('loop schema: accepts until/schedule/immediate, rejects out-of-range or unknown fields', () => {
  assert.equal(validateCuratorAst(loop({ until: 'x', schedule: 'every 1 hour', immediate: true })).valid, true);
  assert.equal(validateCuratorAst(loop({ maxIterations: AST_LIMITS.maxLoopIterations + 1 })).valid, false);
  assert.equal(validateCuratorAst(loop({ bogus: 1 })).valid, false);
  assert.equal(validateCuratorAst({ type: 'Curator_Loop' }).valid, false);
});
