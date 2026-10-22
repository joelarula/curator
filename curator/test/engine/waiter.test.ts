import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, compileFixture } from '../helpers/harness.ts';

// Waiter: parks on a human prompt for a nickname, registers it, and only then lets the user into the next flow.
test('waiter: next flow does not start until the nickname is registered', async () => {
  const registry: string[] = [];
  const env = await createEnv('waiter', {
    register: (a: any) => { registry.push(a.nick); return 'registered'; },
    welcome: () => 'ok',
  });
  try {
    const { requestId, result } = await runAst(env, await compileFixture('waiter.coffee'));
    assert.equal(result.waiting, true, 'parked on the nickname prompt');
    assert.equal(env.calls.length, 0, 'nothing registered, nobody welcomed yet');

    const waiting = await env.prisma.request.findFirst({ where: { conversationId: env.conversationId, status: 'WAITING_FOR_USER' } });
    assert.equal(waiting.context.choicePrompt, 'Your nickname?');

    await env.processor.emitEventRequest({
      eventName: 'curator:choice',
      payload: 'ada',
      conversationId: env.conversationId,
      userId: env.userId,
      origin: 'API',
    });
    const after = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(after.done, true);

    assert.deepEqual(registry, ['ada']);
    assert.deepEqual(env.calls.map((c: any) => [c.name ?? c.tool, c.args.nick]), [
      ['register', 'ada'],
      ['welcome', 'ada'],
    ]);
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

const answer = (env: any, text: string) =>
  env.processor.emitEventRequest({
    eventName: 'curator:choice', payload: text,
    conversationId: env.conversationId, userId: env.userId, origin: 'API',
  });

// Silence is handled in the script: each unanswered prompt times out, the user is reminded and asked again.
test('waiter retry: a silent user is reminded and re-asked, then admitted when he answers', async () => {
  let now = Date.UTC(2100, 0, 1);
  const env = await createEnv('waiter_retry', { remind: () => 'ok', register: () => 'ok', welcome: () => 'ok', give_up: () => 'ok' }, { now: () => now });
  try {
    const { requestId, result } = await runAst(env, await compileFixture('waiter_retry.coffee'));
    assert.equal(result.waiting, true);

    now += 31_000; // first prompt times out
    let r = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(r.waiting, true, 'asked again');
    assert.deepEqual(env.calls.map((c: any) => c.tool), ['remind'], 'reminded once');
    const timeouts = (await env.prisma.response.findMany({ where: { conversationId: env.conversationId } }))
      .filter((x: any) => String(x.content).includes('HUMAN_TIMEOUT'));
    assert.equal(timeouts.length, 1);

    await answer(env, 'ada'); // answers the second prompt in time
    r = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(r.done, true);
    assert.deepEqual(env.calls.map((c: any) => c.tool), ['remind', 'register', 'welcome']);
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

test('waiter retry: after the last attempt times out the user is given up on', async () => {
  let now = Date.UTC(2100, 0, 1);
  const env = await createEnv('waiter_giveup', { remind: () => 'ok', register: () => 'ok', welcome: () => 'ok', give_up: () => 'ok' }, { now: () => now });
  try {
    const { requestId } = await runAst(env, await compileFixture('waiter_retry.coffee'));
    let r: any = { waiting: true };
    for (let i = 0; i < 3 && !r.done; i++) {
      now += 31_000;
      r = await env.processor.stepUntil({ conversationId: env.conversationId });
    }
    assert.equal(r.done, true);
    assert.ok(!env.calls.some((c: any) => c.tool === 'register' || c.tool === 'welcome'), 'never registered or welcomed');
    assert.equal(env.calls.filter((c: any) => c.tool === 'remind').length, 3, 'reminded after every timeout');
    assert.equal(env.calls.at(-1).tool, 'give_up');
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

