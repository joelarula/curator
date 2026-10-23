import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, compileFixture } from '../helpers/harness.ts';

const canned = { got: () => 'ok', gave_up: () => 'ok', after: () => 'ok' };
const T0 = Date.UTC(2100, 0, 1);
const tools = (env: any) => env.calls.map((c: any) => c.tool);

test('wait_event timeout: compiles to a Curator_WaitEvent with timeoutSeconds', async () => {
  const ast: any = await compileFixture('wait_timeout.coffee');
  assert.deepEqual(ast.subAgents[0], { type: 'Curator_WaitEvent', eventName: 'ping', payloadAlias: 'msg', timeoutSeconds: 30 });
});

test('wait_event timeout: silence past the deadline completes the wait and the flow moves on', async () => {
  let now = T0;
  const env = await createEnv('wait_to', canned, { now: () => now });
  try {
    const { requestId, result } = await runAst(env, await compileFixture('wait_timeout.coffee'));
    assert.equal(result.waiting, true);

    now += 10_000;
    assert.equal((await env.processor.stepUntil({ conversationId: env.conversationId })).waiting, true, 'still parked before the deadline');
    assert.deepEqual(tools(env), []);

    now += 21_000;
    const r = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(r.done, true);
    assert.deepEqual(tools(env), ['gave_up', 'after']);
    const timeouts = (await env.prisma.response.findMany({ where: { conversationId: env.conversationId } }))
      .filter((x: any) => String(x.content).includes('WAIT_TIMEOUT'));
    assert.equal(timeouts.length, 1);
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

test('wait_event timeout: an event before the deadline wins and nothing times out later', async () => {
  let now = T0;
  const env = await createEnv('wait_in_time', canned, { now: () => now });
  try {
    await runAst(env, await compileFixture('wait_timeout.coffee'));
    now += 10_000;
    await env.processor.emitEventRequest({
      eventName: 'ping', payload: { text: 'hi' },
      conversationId: env.conversationId, userId: env.userId, origin: 'API',
    });
    const r = await env.processor.stepUntil({ conversationId: env.conversationId });
    assert.equal(r.done, true);
    assert.deepEqual(tools(env), ['got', 'after']);

    now += 60_000;
    await env.processor.step({ conversationId: env.conversationId, take: 10 });
    const timeouts = (await env.prisma.response.findMany({ where: { conversationId: env.conversationId } }))
      .filter((x: any) => String(x.content).includes('WAIT_TIMEOUT'));
    assert.equal(timeouts.length, 0);
    assert.deepEqual(tools(env), ['got', 'after']);
  } finally {
    await env.cleanup();
  }
});
