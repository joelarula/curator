import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, makeFakeEngine } from '../helpers/harness.ts';
import { EXTERNAL_DATABASES, externalEnv, externalDatabaseUrl, closeExternalDatabases } from '../helpers/externalDb.ts';
import { CuratorRequestProcessor } from '../../src/engine/CuratorRequestProcessor.ts';

test.after(closeExternalDatabases);

test('idle polling: the interval doubles while idle, up to the maximum, and never past the next scheduled request', async () => {
  let now = Date.UTC(2100, 0, 1);
  const env = await createEnv('idle_polling', {}, { now: () => now, idlePolling: { maxIntervalMs: 8000 } });
  try {
    const p = env.processor as any;
    p.pollIntervalMs = 1000;
    assert.deepEqual([await p.nextPollDelay(0), await p.nextPollDelay(0), await p.nextPollDelay(0), await p.nextPollDelay(0)], [2000, 4000, 8000, 8000]);
    assert.equal(await p.nextPollDelay(1), 1000, 'work resets it');
    await p.nextPollDelay(0);
    p.wake();
    assert.equal(p.idleStreak, 0, 'wake() resets it');

    await env.prisma.request.create({
      data: { userId: env.userId, conversationId: env.conversationId, status: 'NEW', scheduledAt: new Date(now + 3000) },
    });
    for (let i = 0; i < 4; i++) await p.nextPollDelay(0);
    assert.equal(await p.nextPollDelay(0), 3000, 'wakes for the scheduled request');
    now += 2900;
    assert.equal(await p.nextPollDelay(0), 1000, 'never below the start interval');
  } finally {
    await env.cleanup();
  }
});

test('idle polling: off keeps a fixed interval', async () => {
  const env = await createEnv('idle_polling_off', {}, { idlePolling: false });
  try {
    const p = env.processor as any;
    p.pollIntervalMs = 1000;
    assert.deepEqual([await p.nextPollDelay(0), await p.nextPollDelay(0)], [1000, 1000]);
  } finally {
    await env.cleanup();
  }
});

for (const db of EXTERNAL_DATABASES.filter(d => d.name === 'postgres')) {
  test(`wake channel (${db.name}): announce() makes a listening worker poll at once instead of at its interval`, async () => {
    const env = await externalEnv(db);
    const url = await externalDatabaseUrl(db);
    const { engine, calls } = makeFakeEngine({ echo: (a: any) => ({ echoed: a.text }) });
    // Polls once a minute: without the notification it would not see the new request in this test
    const listener = new CuratorRequestProcessor(env.prisma, { engine, wakeChannel: { url }, idlePolling: false, conversationLeases: false } as any);
    const sender = new CuratorRequestProcessor(env.prisma, { engine, conversationLeases: false } as any);
    try {
      await listener.start(60_000);
      const channel = (listener as any).wakeChannel;
      for (let i = 0; i < 100 && !channel.listening; i++) await new Promise(r => setTimeout(r, 50));
      assert.ok(channel.listening, 'LISTEN connection is up');
      await listener.idle();

      await env.prisma.request.create({
        data: {
          userId: env.userId,
          conversationId: env.conversationId,
          status: 'NEW',
          toolName: 'Curator_Workflow',
          ast: { type: 'Curator_Tool', toolName: 'echo', args: { text: 'woken' } },
        },
      });
      const announcedAt = Date.now();
      sender.announce();
      for (let i = 0; i < 100 && calls.length === 0; i++) await new Promise(r => setTimeout(r, 50));
      assert.deepEqual(calls.map(c => c.args.text), ['woken']);
      assert.ok(Date.now() - announcedAt < 5000, 'ran well before the 60s interval');
    } finally {
      listener.stop();
      sender.stop();
      await listener.idle();
      await env.cleanup();
    }
  });
}
