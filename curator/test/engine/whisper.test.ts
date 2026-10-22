import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, compileFixture, saveScript } from '../helpers/harness.ts';

// stepUntil returns as soon as any request is parked, so drain with step() while other agents wait.
async function drain(env: any) {
  for (let idle = 0, i = 0; idle < 3 && i < 500; i++) {
    const n = await env.processor.step({ conversationId: env.conversationId, take: 10 });
    idle = n > 0 ? 0 : idle + 1;
    if (n === 0) await new Promise((r) => setTimeout(r, 20));
  }
}

// Whisper ring: a -> b -> c -> a. Each agent is a parallel branch parked on its own
// `whisper:<name>` event, so a message only reaches the intended recipient.
test('whisper ring: a whispers x to b, b to c, c back to a, strictly in order', async () => {
  const env = await createEnv('whisper_ring', { heard: () => 'ok' });
  try {
    const { requestId, result } = await runAst(env, await compileFixture('whisper_ring.coffee'));
    assert.equal(result.waiting, true, 'all three agents are parked');
    assert.equal(env.calls.length, 0, 'nobody has heard anything yet');

    // Kick off: a receives the secret, which starts the chain.
    await env.processor.emitEventRequest({
      eventName: 'whisper:start',
      payload: 'x',
      conversationId: env.conversationId,
      userId: env.userId,
      origin: 'API',
    });
    await drain(env);

    assert.deepEqual(
      env.calls.map((c: any) => [c.args.agent, c.args.from, c.args.text]),
      [
        ['b', 'a', 'x'],
        ['c', 'b', 'x'],
        ['a', 'c', 'x'],
      ],
    );
    const open = await env.prisma.request.count({ where: { conversationId: env.conversationId, status: { notIn: ['COMPLETED'] } } });
    assert.equal(open, 0, 'every agent branch finished');
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

test('whisper ring with listeners: each hop is heard by its recipient and by the listener on that hop only', async () => {
  const env = await createEnv('whisper_listeners', { heard: () => 'ok' });
  try {
    const { requestId, result } = await runAst(env, await compileFixture('whisper_ring_listeners.coffee'));
    assert.equal(result.waiting, true);

    await env.processor.emitEventRequest({
      eventName: 'whisper:start',
      payload: 'x',
      conversationId: env.conversationId,
      userId: env.userId,
      origin: 'API',
    });
    await drain(env);

    // Order within a hop (recipient vs listener) is not defined, so compare as a set.
    const heard = env.calls.map((c: any) => `${c.args.agent}<-${c.args.from}:${c.args.text}`).sort();
    assert.deepEqual(heard, [
      'a<-c:x', 'b<-a:x', 'c<-b:x',
      'listener1<-a:x', 'listener2<-b:x', 'listener3<-c:x',
    ]);

    const open = await env.prisma.request.count({ where: { conversationId: env.conversationId, status: { notIn: ['COMPLETED'] } } });
    assert.equal(open, 0, 'every agent and listener finished');
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

// Agents are generic: they share one "whisper" bus, don't know in advance what will arrive, and
// each handles only messages addressed to it. A spy sees everything. Ring: a -> b -> c -> a.
test('whisper bus: generic agents wait for any message; spy hears all four hops', async () => {
  const env = await createEnv('whisper_bus', { heard: () => 'ok' });
  try {
    const { requestId, result } = await runAst(env, await compileFixture('whisper_bus.coffee'));
    assert.equal(result.waiting, true);
    // The outside world whispers x to a; everything after that is agent-to-agent.
    await env.processor.emitEventRequest({
      eventName: 'whisper',
      payload: { from: 'outside', to: 'a', text: 'x' },
      conversationId: env.conversationId,
      userId: env.userId,
      origin: 'API',
    });
    await drain(env);
    const byAgent = (name: string) =>
      env.calls.filter((c: any) => c.args.agent === name).map((c: any) => `${c.args.from}:${c.args.text}`);
    assert.deepEqual(byAgent('a'), ['outside:x'], 'a handles only the first message addressed to it');
    assert.deepEqual(byAgent('b'), ['a:x']);
    assert.deepEqual(byAgent('c'), ['b:x']);
    assert.deepEqual(byAgent('spy').sort(), ['a:x', 'b:x', 'c:x', 'outside:x']);

    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

// The human starts the ring with a secret word (HumanInput); a -> b -> c, and c hands it back to the human.
test('whisper ring with human: human gives the secret, it travels a -> b -> c and returns to the human', async () => {
  const env = await createEnv('whisper_ring_human', { heard: () => 'ok' });
  try {
    const { requestId, result } = await runAst(env, await compileFixture('whisper_ring_human.coffee'));
    assert.equal(result.waiting, true);
    assert.equal(env.calls.length, 0);

    await env.processor.emitEventRequest({
      eventName: 'curator:choice',
      payload: 'tulip',
      conversationId: env.conversationId,
      userId: env.userId,
      origin: 'API',
    });
    await drain(env);

    assert.deepEqual(
      env.calls.map((c: any) => [c.args.agent, c.args.from, c.args.text]),
      [
        ['a', 'human', 'tulip'],
        ['b', 'a', 'tulip'],
        ['c', 'b', 'tulip'],
        ['human', 'c', 'tulip'],
      ],
    );
    const open = await env.prisma.request.count({ where: { conversationId: env.conversationId, status: { notIn: ['COMPLETED'] } } });
    assert.equal(open, 0);
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.equal(root.status, 'COMPLETED');
  } finally {
    await env.cleanup();
  }
});

// Isolated branches: every agent uses the same alias (`heard`) and the same event name (`ring`), yet state is
// private per branch and addressed events never reach a branch they were not sent to (the spy).
test('whisper private: same alias in every agent does not collide, addressed events skip the spy', async () => {
  const env = await createEnv('whisper_private', { heard: () => 'ok' });
  try {
    const { requestId, result } = await runAst(env, await compileFixture('whisper_private.coffee'));
    assert.equal(result.waiting, true);

    await env.processor.emitEventRequest({
      eventName: 'start',
      payload: 'tulip',
      targetAgentId: 'a',
      conversationId: env.conversationId,
      userId: env.userId,
      origin: 'API',
    });
    await drain(env);

    assert.deepEqual(
      env.calls.map((c: any) => [c.args.agent, c.args.from, c.args.text]),
      [
        ['b', 'a', 'tulip'],
        ['c', 'b', 'tulip'],
        ['a', 'c', 'tulip'],
      ],
    );
    assert.ok(!env.calls.some((c: any) => c.args.agent === 'spy'), 'the spy heard nothing');

    const conv = await env.prisma.conversation.findFirst({ where: { id: env.conversationId } });
    const state = conv.metadata ?? conv.state;
    assert.equal(state.heard, undefined, 'no alias leaked into shared state');
    assert.deepEqual(Object.keys(state.__scopes).sort(), ['a', 'b', 'c']);
    assert.equal(state.__scopes.b.heard.from, 'a');
    assert.equal(state.__scopes.c.heard.from, 'b');
    assert.equal(state.__scopes.a.heard.from, 'c');

    const spy = await env.prisma.request.findMany({ where: { conversationId: env.conversationId, status: 'WAITING_FOR_EVENT' } });
    assert.equal(spy.length, 1, 'only the spy is still parked');
    const root = await env.prisma.request.findUnique({ where: { id: requestId } });
    assert.notEqual(root.status, 'FAILED');
  } finally {
    await env.cleanup();
  }
});

// Spawn: an addressed event spawns the subscription handler only for the addressed agent, in a private scope.
