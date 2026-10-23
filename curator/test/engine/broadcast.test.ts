import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, compileFixture } from '../helpers/harness.ts';

async function drain(env: any) {
  for (let idle = 0, i = 0; idle < 3 && i < 500; i++) {
    const n = await env.processor.step({ conversationId: env.conversationId, take: 10 });
    idle = n > 0 ? 0 : idle + 1;
    if (n === 0) await new Promise((r) => setTimeout(r, 20));
  }
}

const announce = (env: any, text: string, targetAgentId?: string) =>
  env.processor.emitEventRequest({
    eventName: 'announce', payload: { text }, targetAgentId,
    conversationId: env.conversationId, userId: env.userId, origin: 'API',
  });

const heard = (env: any, agent: string) =>
  env.calls.filter((c: any) => c.args.agent === agent).map((c: any) => c.args.text);

// Broadcast: an unaddressed event reaches every agent in the conversation, each in its own private scope.
test('broadcast: every listening agent hears each announcement, in order, none lost', async () => {
  const env = await createEnv('broadcast', { heard: () => 'ok' });
  try {
    const { requestId, result } = await runAst(env, await compileFixture('broadcast.coffee'));
    assert.equal(result.waiting, true);

    const first = await announce(env, 'one');
    assert.equal(first.woken.length, 3, 'all three agents were parked and woke');
    await drain(env);
    for (const a of ['a', 'b', 'c']) assert.deepEqual(heard(env, a), ['one']);

    await announce(env, 'two');
    await drain(env);
    for (const a of ['a', 'b', 'c']) assert.deepEqual(heard(env, a), ['one', 'two'], `${a} heard both`);

    const conv = await env.prisma.conversation.findFirst({ where: { id: env.conversationId } });
    const state = conv.metadata ?? conv.state;
    assert.equal(state.msg, undefined, 'no alias leaked into shared state');
    assert.deepEqual(Object.keys(state.__scopes).sort(), ['a', 'b', 'c']);

    const open = await env.prisma.request.count({ where: { conversationId: env.conversationId, status: { not: 'COMPLETED' } } });
    assert.equal(open, 0);
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

test('broadcast: an addressed announcement reaches only its recipient; broadcasts still reach everyone', async () => {
  const env = await createEnv('broadcast_addr', { heard: () => 'ok' });
  try {
    await runAst(env, await compileFixture('broadcast.coffee'));

    const direct = await announce(env, 'psst', 'b');
    assert.equal(direct.woken.length, 1);
    await drain(env);
    assert.deepEqual(heard(env, 'b'), ['psst']);
    assert.deepEqual(heard(env, 'a'), []);
    assert.deepEqual(heard(env, 'c'), []);

    await announce(env, 'all');
    await drain(env);
    assert.deepEqual(heard(env, 'a'), ['all']);
    assert.deepEqual(heard(env, 'b'), ['psst', 'all']);
    assert.deepEqual(heard(env, 'c'), ['all']);
  } finally {
    await env.cleanup();
  }
});
