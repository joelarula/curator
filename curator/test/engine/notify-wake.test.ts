import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from '../helpers/harness.ts';

const canned = { echo: (a: any) => ({ echoed: a.text }) };
const echo = (text: string) => ({ type: 'Curator_Tool', toolName: 'echo', args: { text } });

test('notify: a finishing child never unlocks a target another worker is already running', async () => {
  const env = await createEnv('notify_running_target', canned);
  try {
    // The target was resumed some other way and claimed: WAITING, locked, nothing pending
    const target = await env.prisma.request.create({
      data: {
        userId: env.userId,
        conversationId: env.conversationId,
        status: 'WAITING',
        lockedBy: 'other-worker',
        lockedAt: new Date(),
        pendingDependencies: 0,
        ast: echo('target'),
      },
    });
    await env.prisma.request.create({
      data: { userId: env.userId, conversationId: env.conversationId, status: 'NEW', notifyId: target.id, ast: echo('late child') },
    });

    assert.equal(await env.processor.step({ conversationId: env.conversationId }), 1);
    const after = await env.prisma.request.findUnique({ where: { id: target.id } });
    assert.equal(after.status, 'WAITING', 'not made runnable a second time');
    assert.equal(after.lockedBy, 'other-worker', 'the running worker keeps its lock');
  } finally {
    await env.cleanup();
  }
});

test('notify: a target with several dependencies wakes once, when the last one finishes', async () => {
  const env = await createEnv('notify_last_dependency', canned);
  try {
    const target = await env.prisma.request.create({
      data: { userId: env.userId, conversationId: env.conversationId, status: 'WAITING', pendingDependencies: 2, ast: echo('target') },
    });
    for (const text of ['a', 'b']) {
      await env.prisma.request.create({
        data: { userId: env.userId, conversationId: env.conversationId, status: 'NEW', notifyId: target.id, ast: echo(text), priority: text === 'a' ? 1 : 0 },
      });
    }

    await env.processor.step({ conversationId: env.conversationId, take: 1 });
    let state = await env.prisma.request.findUnique({ where: { id: target.id } });
    assert.deepEqual([state.status, state.pendingDependencies], ['WAITING', 1]);

    await env.processor.step({ conversationId: env.conversationId, take: 1 });
    state = await env.prisma.request.findUnique({ where: { id: target.id } });
    assert.deepEqual([state.status, state.pendingDependencies, state.lockedBy], ['NEW', 0, null]);
  } finally {
    await env.cleanup();
  }
});

test('notify: dependencies finishing at the same time all count, and the target wakes once', async () => {
  const env = await createEnv('notify_concurrent_dependencies', canned);
  try {
    // Parallel branches finishing together (load test: a Join was left at 1 when the count was read then decremented)
    const target = await env.prisma.request.create({
      data: { userId: env.userId, conversationId: env.conversationId, status: 'WAITING', pendingDependencies: 5, ast: { type: 'Curator_Join', name: 'join' } },
    });
    await Promise.all(Array.from({ length: 5 }, () => (env.processor as any).dependencyDone(target.id)));
    const state = await env.prisma.request.findUnique({ where: { id: target.id } });
    assert.deepEqual([state.status, state.pendingDependencies, state.lockedBy], ['NEW', 0, null]);
  } finally {
    await env.cleanup();
  }
});
