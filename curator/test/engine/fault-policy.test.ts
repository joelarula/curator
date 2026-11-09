import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, stepResults } from '../helpers/harness.ts';
import { classifyError, decideRetry, NodeTimeoutError, ToolExecutionError } from '../../src/engine/FaultPolicy.ts';
import { validateCuratorAst } from '../../src/engine/CuratorAstValidation.ts';

const T0 = Date.UTC(2100, 0, 1);
const tool = (name: string, extra: Record<string, any> = {}) => ({ type: 'Curator_Tool', toolName: name, args: {}, ...extra });
const calls = (env: any, name: string) => env.calls.filter((c: any) => c.tool === name).length;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- policy decisions (pure) ---

test('fault policy: errors are classified by kind', () => {
  assert.equal(classifyError(new Error('429 Too Many Requests')), 'rate_limit');
  assert.equal(classifyError(new Error('Quota exceeded. Please retry in 3s')), 'rate_limit');
  assert.equal(classifyError(new Error('fetch failed: ECONNRESET')), 'transient');
  assert.equal(classifyError(new Error('upstream 503')), 'transient');
  assert.equal(classifyError(new NodeTimeoutError(10)), 'timeout');
  assert.equal(classifyError(new ToolExecutionError('t', new Error('boom'))), 'tool_error');
  assert.equal(classifyError(new ToolExecutionError('t', new Error('socket hang up'))), 'transient', 'a tool error keeps its cause class');
  assert.equal(classifyError(new Error('bad input')), 'error');
});

test('fault policy: without a policy only rate limits retry, 5 times, 5s doubling', () => {
  const rl = new Error('429');
  assert.deepEqual(decideRetry(undefined, 0, rl), { retry: true, errorClass: 'rate_limit', delayMs: 5000, attempt: 1, maxAttempts: 6 });
  assert.equal((decideRetry(undefined, 2, rl) as any).delayMs, 20_000);
  assert.deepEqual(decideRetry(undefined, 5, rl), { retry: false, errorClass: 'rate_limit', attempt: 6, maxAttempts: 6, reason: 'exhausted' });
  assert.equal(decideRetry(undefined, 0, new Error('ECONNRESET')).retry, false);
  // A server hint wins when longer than the backoff
  assert.equal((decideRetry(undefined, 0, new Error('Please retry in 12s')) as any).delayMs, 13_000);
});

test('fault policy: a declared policy sets attempts, backoff, classes and message patterns', () => {
  const policy = { maxAttempts: 3, backoff: { initialMs: 100, factor: 3, maxMs: 250, jitter: false } };
  assert.equal((decideRetry(policy, 0, new Error('ECONNRESET')) as any).delayMs, 100);
  assert.equal((decideRetry(policy, 1, new NodeTimeoutError(5)) as any).delayMs, 250, 'capped at maxMs');
  assert.equal(decideRetry(policy, 2, new Error('ECONNRESET')).retry, false, 'third attempt was the last');
  assert.equal(decideRetry(policy, 0, new Error('bad input')).retry, false, 'plain errors are not in the default retryOn');

  const custom = { maxAttempts: 2, retryOn: ['tool_error', 'lock (held|busy)'] };
  assert.equal(decideRetry(custom, 0, new ToolExecutionError('t', 'x')).retry, true);
  assert.equal(decideRetry(custom, 0, new Error('Lock busy')).retry, true, 'regex entries match the message, case-insensitively');
  assert.equal(decideRetry(custom, 0, new Error('429')).retry, false, 'a custom retryOn replaces the defaults');

  const jittered = decideRetry({ backoff: { initialMs: 1000 } }, 0, new Error('ECONNRESET'), () => 0) as any;
  assert.equal(jittered.delayMs, 500, 'jitter (on by default for declared policies) scales by 0.5..1');
});

test('fault policy: retry and timeoutMs are validated on any node', () => {
  assert.equal(validateCuratorAst(tool('t', { retry: { maxAttempts: 2, retryOn: ['transient'] }, timeoutMs: 1000 })).valid, true);
  assert.equal(validateCuratorAst(tool('t', { retry: { maxAttempts: 0 } })).valid, false);
  assert.equal(validateCuratorAst(tool('t', { retry: { tries: 2 } })).valid, false);
  assert.equal(validateCuratorAst(tool('t', { timeoutMs: 0 })).valid, false);
  assert.equal(validateCuratorAst({ type: 'Curator_Sequential', subAgents: [tool('t')], retry: { maxAttempts: 2 } }).valid, true);
});

// --- engine behaviour ---

test('fault policy: a failing tool with a policy is retried after its backoff, then succeeds', async () => {
  let now = T0;
  let failures = 2;
  const env = await createEnv('fp_retry', {
    flaky: () => { if (failures-- > 0) throw new Error('ECONNRESET'); return { ok: true }; },
  }, { now: () => now });
  try {
    const ast = tool('flaky', { retry: { maxAttempts: 3, backoff: { initialMs: 1000, jitter: false } } });
    const { requestId, result } = await runAst(env, ast);
    assert.equal(result.done, false, 'the retry is scheduled for later');
    assert.equal(calls(env, 'flaky'), 1);

    now += 999;
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(calls(env, 'flaky'), 1, 'not before the backoff passed');

    now += 1;
    await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(calls(env, 'flaky'), 2);

    now += 2000;
    const r = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(r.done, true);
    assert.equal(calls(env, 'flaky'), 3);
    const req = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(req.status, 'COMPLETED');
    assert.equal(req.retryCount, 2);
    const results = await stepResults(env.prisma, { requestId });
    assert.equal(results.length, 1, 'failed attempts leave no Response behind');
    assert.match(results[0].content, /"ok":true/);
  } finally {
    await env.cleanup();
  }
});

test('fault policy: exhausted attempts end the node FAILED and onError runs', async () => {
  let now = T0;
  const env = await createEnv('fp_exhausted', {
    broken: () => { throw new Error('ECONNRESET'); },
    fallback: () => 'recovered',
  }, { now: () => now });
  try {
    const ast = tool('broken', { retry: { maxAttempts: 2, backoff: { initialMs: 10, jitter: false } }, onError: tool('fallback') });
    const { requestId } = await runAst(env, ast);
    now += 10;
    const r = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(r.done, true);
    assert.equal(calls(env, 'broken'), 2);
    assert.equal(calls(env, 'fallback'), 1);
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'FAILED');
  } finally {
    await env.cleanup();
  }
});

test('fault policy: non-retryable errors fail at once, even with a policy', async () => {
  const env = await createEnv('fp_not_retryable', { strict: () => { throw new Error('bad input'); } });
  try {
    const { requestId, result } = await runAst(env, tool('strict', { retry: { maxAttempts: 5 } }));
    assert.equal(result.done, true);
    assert.equal(calls(env, 'strict'), 1);
    const req = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(req.status, 'FAILED');
    assert.equal(req.retryCount, 0);
    assert.match((await stepResults(env.prisma, { requestId }))[0].content, /Tool 'strict' failed: bad input/);
  } finally {
    await env.cleanup();
  }
});

test('fault policy: a handler failing its own attempt (failRequest) is retried too', async () => {
  const env = await createEnv('fp_fail_request', {});
  try {
    const ast = { type: 'Curator_Call', ref: 'no_such_script', retry: { maxAttempts: 2, retryOn: ['error'], backoff: { initialMs: 0 } } };
    const { requestId, result } = await runAst(env, ast);
    assert.equal(result.done, true);
    const req = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(req.status, 'FAILED');
    assert.equal(req.retryCount, 1, 'the first failure was retried once');
    const contents = (await stepResults(env.prisma, { requestId })).map((r) => r.content);
    assert.equal(contents.length, 1, 'only the final failure is recorded');
    assert.match(contents[0], /no_such_script/);
  } finally {
    await env.cleanup();
  }
});

test('fault policy: without a policy a tool error still completes as [Tool Error]', async () => {
  const env = await createEnv('fp_legacy', { broken: () => { throw new Error('ECONNRESET'); } });
  try {
    const { requestId, result } = await runAst(env, tool('broken'));
    assert.equal(result.done, true);
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'COMPLETED');
    assert.match((await stepResults(env.prisma, { requestId }))[0].content, /^\[Tool Error\] ECONNRESET/);
  } finally {
    await env.cleanup();
  }
});

test('fault policy: an attempt past timeoutMs fails, and its late result is discarded', async () => {
  const env = await createEnv('fp_timeout', {
    slow: async () => { await sleep(150); return { late: true }; },
    fallback: () => 'timed out',
  });
  try {
    const { requestId, result } = await runAst(env, tool('slow', { timeoutMs: 30, onError: tool('fallback') }));
    assert.equal(result.done, true);
    assert.equal(calls(env, 'fallback'), 1);
    await sleep(200); // the abandoned attempt finishes now; its writes must not land
    const req = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(req.status, 'FAILED');
    const contents = (await stepResults(env.prisma, { requestId })).map((r) => r.content);
    assert.deepEqual(contents, ['ERROR: Timed out after 30ms']);
  } finally {
    await env.cleanup();
  }
});

test('fault policy: a timed-out attempt is retried when the policy covers timeouts', async () => {
  let now = T0;
  let first = true;
  const env = await createEnv('fp_timeout_retry', {
    sometimesSlow: async () => {
      if (first) { first = false; await sleep(150); }
      return { ok: true };
    },
  }, { now: () => now });
  try {
    const ast = tool('sometimesSlow', { timeoutMs: 30, retry: { maxAttempts: 2, backoff: { initialMs: 5, jitter: false } } });
    const { requestId } = await runAst(env, ast);
    now += 5;
    const r = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(r.done, true);
    await sleep(200);
    const req = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(req.status, 'COMPLETED');
    assert.equal(req.retryCount, 1);
    const contents = (await stepResults(env.prisma, { requestId })).map((r) => r.content);
    assert.equal(contents.length, 1);
    assert.match(contents[0], /"ok":true/);
  } finally {
    await env.cleanup();
  }
});
