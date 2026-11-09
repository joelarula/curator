import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, saveScript, runScript, stepResults } from '../helpers/harness.ts';
import { applyMergeRules, branchConflicts, mergeValue } from '../../src/engine/StateMerge.ts';
import { validateCuratorAst } from '../../src/engine/CuratorAstValidation.ts';

const tool = (name: string, extra: any = {}) => ({ type: 'Curator_Tool', toolName: name, args: {}, ...extra });
const par = (subAgents: any[], extra: any = {}) => ({ type: 'Curator_Parallel', subAgents, ...extra });
const stateOf = async (env: any) => (await env.prisma.conversation.findUnique({ where: { id: env.conversationId } })).metadata || {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- pure rules ---

test('merge rules: each rule combines the current and incoming value', () => {
  assert.deepEqual(mergeValue('k', [1], 2, 'append'), [1, 2]);
  assert.deepEqual(mergeValue('k', undefined, [1, 2], 'append'), [1, 2]);
  assert.deepEqual(mergeValue('k', [{ a: 1 }], [{ a: 1 }, { a: 2 }], 'union'), [{ a: 1 }, { a: 2 }]);
  assert.equal(mergeValue('k', 2, 3, 'sum'), 5);
  assert.equal(mergeValue('k', undefined, 3, 'sum'), 3);
  assert.equal(mergeValue('k', 2, 3, 'max'), 3);
  assert.equal(mergeValue('k', 2, 3, 'min'), 2);
  assert.deepEqual(mergeValue('k', { a: { x: 1 }, b: 1 }, { a: { y: 2 } }, 'deepMerge'), { a: { x: 1, y: 2 }, b: 1 });
  assert.equal(mergeValue('k', 1, 2, 'replace'), 2);
  assert.throws(() => mergeValue('k', 'a', 1, 'sum'), /needs numbers/);
  const longest = (args: any) => ({ value: String(args.incoming).length > String(args.current ?? '').length ? args.incoming : args.current });
  assert.equal(mergeValue('k', 'abc', 'x', { reducer: 'longest' }, (n) => (n === 'longest' ? longest : undefined)), 'abc');
  assert.throws(() => mergeValue('k', 1, 2, { reducer: 'missing' }, () => undefined), /not registered/);
});

test('merge rules: a write records the rules it used and the values as written', () => {
  assert.deepEqual(applyMergeRules({ n: 1 }, { n: 2, other: 'x' }, { n: 'sum' }), { set: { n: 3, other: 'x' }, merge: { n: 'sum' } });
  assert.deepEqual(applyMergeRules({}, { other: 'x' }, { n: 'sum' }), { set: { other: 'x' } });
});

test('merge rules: conflicts are keys without a rule that two branches wrote', () => {
  const writes = [{ branch: 'a', keys: ['x', 'items'] }, { branch: 'b', keys: ['x', 'items', 'y'] }, { branch: 'a', keys: ['x'] }];
  assert.deepEqual(branchConflicts(writes, { items: 'append' }), { x: ['a', 'b'] });
});

test('merge rules: stateSchema, strict, mergeBack and join validate', () => {
  assert.equal(validateCuratorAst(par([tool('a')], { stateSchema: { items: { merge: 'append' } }, strict: true, join: { as: 'r', requires: { min: 1 }, onBranchFailure: 'fail_fast', timeoutMs: 10 } })).valid, true);
  assert.equal(validateCuratorAst(par([tool('a')], { stateSchema: { items: { merge: 'concat' } } })).valid, false);
  assert.equal(validateCuratorAst(par([tool('a')], { join: { requires: 'most' } })).valid, false);
  assert.equal(validateCuratorAst({ type: 'Curator_Sequential', subAgents: [tool('a')], stateSchema: {} }).valid, false, 'only Parallel and Module declare rules');
});

// --- engine ---

test('merge rules: parallel branches appending and summing into the same keys keep every write', async () => {
  const env = await createEnv('sm_parallel', {
    a: () => ({ items: ['a'], total: 1 }),
    b: () => ({ items: ['b'], total: 2 }),
    c: () => ({ items: ['c'], total: 3 }),
  });
  try {
    const { result } = await runAst(env, par([tool('a'), tool('b'), tool('c')], { stateSchema: { items: { merge: 'append' }, total: { merge: 'sum' } } }));
    assert.equal(result.done, true);
    const state = await stateOf(env);
    assert.deepEqual([...state.items].sort(), ['a', 'b', 'c']);
    assert.equal(state.total, 6);
    const merged = await env.prisma.eventLog.findMany({ where: { conversationId: env.conversationId } });
    assert.ok(merged.some((e: any) => e.payload?.merge?.items === 'append'), 'events record the rule applied');
  } finally {
    await env.cleanup();
  }
});

test('merge rules: a module stateSchema applies to every step of the module', async () => {
  const env = await createEnv('sm_module', { first: () => ({ log: 'one' }), second: () => ({ log: 'two' }), done: () => 'ok' });
  try {
    // A step's output merges into state when it hands over to the next step, so `done` closes the flow
    const saved = await saveScript(env, 'logger', {
      type: 'Curator_Module', name: 'logger', stateSchema: { log: { merge: 'append' } },
      main: { type: 'Curator_Sequential', subAgents: [tool('first'), tool('second'), tool('done')] },
    });
    await runScript(env, saved.scriptId, saved.version);
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.deepEqual((await stateOf(env)).log, ['one', 'two']);
  } finally {
    await env.cleanup();
  }
});

test('merge rules: with a stateSchema, a key two branches wrote without a rule fails the Join', async () => {
  const env = await createEnv('sm_strict', { a: () => ({ winner: 'a', items: ['a'] }), b: () => ({ winner: 'b', items: ['b'] }) });
  try {
    const { requestId } = await runAst(env, { type: 'Curator_Sequential', subAgents: [par([tool('a'), tool('b')], { stateSchema: { items: { merge: 'append' } } })] });
    await env.processor.stepUntil({ conversationId: env.conversationId });
    const join = (await env.prisma.request.findMany({ where: { conversationId: env.conversationId } })).find((r: any) => r.ast?.type === 'Curator_Join');
    assert.equal(join.status, 'FAILED');
    const [res] = (await stepResults(env.prisma, { requestId: join.id })).map((r) => r.content);
    assert.match(res, /same state keys without a merge rule: 'winner' \(branch0, branch1\)/);
    assert.ok(requestId);
  } finally {
    await env.cleanup();
  }
});

test('merge rules: without any stateSchema a conflict only warns (last write wins), as before', async () => {
  const env = await createEnv('sm_lenient', { a: () => ({ winner: 'a' }), b: () => ({ winner: 'b' }) });
  try {
    const { result } = await runAst(env, par([tool('a'), tool('b')]));
    assert.equal(result.done, true);
    const join = (await env.prisma.request.findMany({ where: { conversationId: env.conversationId } })).find((r: any) => r.ast?.type === 'Curator_Join');
    assert.equal(join.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

test('merge rules: isolated branches merge their scopes back through the rules', async () => {
  const env = await createEnv('sm_merge_back', { a: () => ({ items: ['a'], note: 'from a' }), b: () => ({ items: ['b'] }) });
  try {
    await runAst(env, par([tool('a', { name: 'left' }), tool('b', { name: 'right' })], { isolate: true, mergeBack: true, stateSchema: { items: { merge: 'append' } } }));
    const state = await stateOf(env);
    assert.deepEqual([...state.items].sort(), ['a', 'b']);
    assert.equal(state.note, 'from a');
    assert.deepEqual(state.__scopes.left.items, ['a'], 'the private scopes stay as they were');
  } finally {
    await env.cleanup();
  }
});

test('join: `as` records each branch outcome; requires all fails on one failed branch', async () => {
  const env = await createEnv('join_all', { ok: () => ({ fine: true }), bad: () => { throw new Error('boom'); } });
  try {
    await runAst(env, par([tool('ok', { name: 'good' }), tool('bad', { name: 'broken', retry: { maxAttempts: 1 } })], { join: { as: 'outcome', requires: 'all' } }));
    const join = (await env.prisma.request.findMany({ where: { conversationId: env.conversationId } })).find((r: any) => r.ast?.type === 'Curator_Join');
    assert.equal(join.status, 'FAILED');
    assert.equal(join.context.outcome.good.status, 'COMPLETED');
    assert.deepEqual(join.context.outcome.good.output, { fine: true });
    assert.equal(join.context.outcome.broken.status, 'FAILED');
    assert.match((await stepResults(env.prisma, { requestId: join.id }))[0].content, /1 of 2 parallel branches succeeded, 2 required/);
  } finally {
    await env.cleanup();
  }
});

test('join: with requires any (default) a failed branch is tolerated and `as` lands in state', async () => {
  const env = await createEnv('join_any', { ok: () => ({ fine: true }), bad: () => { throw new Error('boom'); } });
  try {
    const { result } = await runAst(env, par([tool('ok', { name: 'good' }), tool('bad', { name: 'broken', retry: { maxAttempts: 1 } })], { join: { as: 'outcome' } }));
    assert.equal(result.done, true);
    const state = await stateOf(env);
    assert.equal(state.outcome.broken.status, 'FAILED');
    assert.equal(state.outcome.good.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

test('join: fail_fast cancels the other branches and fails at once', async () => {
  const env = await createEnv('join_fail_fast', { bad: () => { throw new Error('boom'); }, later: () => ({ ran: true }), never: () => ({ ran: true }) });
  try {
    const slow = { type: 'Curator_Sequential', name: 'slow', subAgents: [tool('later'), tool('never')] };
    await runAst(env, par([tool('bad', { name: 'broken', retry: { maxAttempts: 1 }, priority: 10 }), slow], { join: { as: 'outcome', onBranchFailure: 'fail_fast' } }));
    const reqs = await env.prisma.request.findMany({ where: { conversationId: env.conversationId } });
    const join = reqs.find((r: any) => r.ast?.type === 'Curator_Join');
    assert.equal(join.status, 'FAILED');
    assert.match((await stepResults(env.prisma, { requestId: join.id }))[0].content, /fail_fast/);
    assert.equal(env.calls.filter((c: any) => c.tool === 'never').length, 0, 'the rest of the other branch was cancelled');
    assert.ok(reqs.some((r: any) => r.status === 'CANCELLED'));
  } finally {
    await env.cleanup();
  }
});

test('join: timeoutMs closes the Join, reporting unfinished branches as TIMEOUT', async () => {
  let now = Date.UTC(2100, 0, 1);
  const env = await createEnv('join_timeout', { quick: () => ({ q: 1 }) }, { now: () => now });
  try {
    const waiting = { type: 'Curator_WaitEvent', name: 'waiter', eventName: 'never-comes' };
    await runAst(env, par([tool('quick', { name: 'fast' }), waiting], { join: { as: 'outcome', timeoutMs: 5000 } }));
    let join = (await env.prisma.request.findMany({ where: { conversationId: env.conversationId } })).find((r: any) => r.ast?.type === 'Curator_Join');
    assert.equal(join.status, 'NEW', 'still waiting for the slow branch');
    now += 5000;
    await env.processor.stepUntil({ conversationId: env.conversationId });
    join = await env.prisma.request.findUnique({ where: { id: join.id } });
    assert.equal(join.status, 'COMPLETED', 'requires any: the fast branch is enough');
    assert.equal(join.context.outcome.fast.status, 'COMPLETED');
    assert.equal(join.context.outcome.waiter.status, 'TIMEOUT');
    await sleep(0);
  } finally {
    await env.cleanup();
  }
});
