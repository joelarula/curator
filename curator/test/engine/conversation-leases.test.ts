import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, type TestEnv } from '../helpers/harness.ts';
import { EXTERNAL_DATABASES, externalEnv, closeExternalDatabases } from '../helpers/externalDb.ts';
import { PrismaStorageAdapter } from '../../src/storage/PrismaStorageAdapter.ts';
import { CuratorRequestProcessor } from '../../src/engine/CuratorRequestProcessor.ts';
import { makeFakeEngine } from '../helpers/harness.ts';

const TTL = 30_000;

/** Two workers over one database with leases on, sharing a movable clock. */
async function leaseEnv(makeEnv: () => Promise<TestEnv>) {
  const env = await makeEnv();
  let now = Date.UTC(2100, 0, 1);
  const clock = () => now;
  const store = new PrismaStorageAdapter(env.prisma, { clock, leases: { ttlMs: TTL } });
  const conversation = async () => (await env.prisma.conversation.create({ data: { userId: env.userId } })).id;
  const request = (conversationId: number) =>
    env.prisma.request.create({ data: { userId: env.userId, conversationId, status: 'NEW', scheduledAt: new Date(now - 1000) } });
  return { env, store, conversation, request, advance: (ms: number) => (now += ms), lease: (conversationId: number) => env.prisma.conversationLease.findUnique({ where: { conversationId } }) };
}

// Claim SQL differs per engine: real servers too when CURATOR_TEST_POSTGRES_URL / CURATOR_TEST_MARIADB_URL are set
const TARGETS: Array<[string, (name: string) => Promise<TestEnv>]> = [
  ['sqlite', (name) => createEnv(name)],
  ...EXTERNAL_DATABASES.map((db): [string, (name: string) => Promise<TestEnv>] => [db.name, () => externalEnv(db)]),
];
test.after(closeExternalDatabases);

for (const [target, makeEnv] of TARGETS) {
  test(`leases (${target}): one worker at a time claims a conversation; others take the rest`, async () => {
    const le = await leaseEnv(() => makeEnv('leases_claim'));
    try {
      const shared = await le.conversation();
      const other = await le.conversation();
      const first = await le.request(shared);
      const second = await le.request(shared);
      const elsewhere = await le.request(other);

      assert.deepEqual((await le.store.claimRows('w1', { limit: 1 })).map((r: any) => r.id), [first.id]);
      assert.equal((await le.lease(shared))?.owner, 'w1');

      // w2 cannot take the second request of w1's conversation, only the other conversation
      assert.deepEqual((await le.store.claimRows('w2', { limit: 10 })).map((r: any) => r.id), [elsewhere.id]);
      assert.equal((await le.lease(other))?.owner, 'w2');
      assert.deepEqual((await le.store.claimRows('w1', { limit: 10 })).map((r: any) => r.id), [second.id]);
    } finally {
      await le.env.cleanup();
    }
  });

  test(`leases (${target}): a lapsed lease is taken over; renew keeps it, release frees it`, async () => {
    const le = await leaseEnv(() => makeEnv('leases_lapse'));
    try {
      const conv = await le.conversation();
      await le.request(conv);
      await le.store.claimRows('w1', { limit: 1 });
      await le.request(conv);

      le.advance(TTL / 2);
      await le.store.renewLeases('w1', [conv]);
      le.advance(TTL / 2 + 1);
      assert.deepEqual(await le.store.claimRows('w2', { limit: 10 }), [], 'renewed: still w1');

      le.advance(TTL);
      assert.equal((await le.store.claimRows('w2', { limit: 10 })).length, 1, 'lapsed: w2 takes over');
      assert.equal((await le.lease(conv))?.owner, 'w2');

      assert.equal(await le.store.releaseLeases('w2', [conv]), 0, 'kept while in flight');
      assert.equal(await le.store.releaseLeases('w2'), 1);
      assert.equal(await le.lease(conv), null);
    } finally {
      await le.env.cleanup();
    }
  });

  test(`leases (${target}): a crashed owner's claimed requests are released once its lease lapses`, async () => {
    const le = await leaseEnv(() => makeEnv('leases_recover'));
    try {
      const crashed = await le.conversation();
      const idle = await le.conversation();
      const inFlight = await le.request(crashed);
      await le.request(idle);
      assert.equal((await le.store.claimRows('w1', { limit: 10 })).length, 2);
      // w1 finishes its idle conversation's request, then dies holding the other one
      await le.env.prisma.request.updateMany({ where: { conversationId: idle }, data: { status: 'COMPLETED', lockedBy: null } });

      assert.equal(await le.store.recoverLapsedLeases('w2'), 0, 'live lease: nothing to recover');
      le.advance(TTL + 1);
      assert.equal(await le.store.recoverLapsedLeases('w2'), 1);
      assert.equal((await le.lease(crashed))?.owner, 'w2');
      assert.equal((await le.lease(idle))?.owner, 'w1', 'an expired lease with nothing claimed is left alone');
      assert.equal(await le.store.recoverLapsedLeases('w3'), 0, 'taken over once');
      assert.deepEqual((await le.store.claimRows('w2', { limit: 10 })).map((r: any) => r.id), [inFlight.id]);
    } finally {
      await le.env.cleanup();
    }
  });

}

test('leases: a processor with leases on runs its flow, holds the lease, and releases it when stopped', async () => {
  const env = await createEnv('leases_processor');
  try {
    const { engine, calls } = makeFakeEngine({ echo: (a: any) => ({ echoed: a.text }) });
    const processor = new CuratorRequestProcessor(env.prisma, { engine, conversationLeases: { ttlMs: TTL } } as any);
    assert.ok(processor.maintenanceSystems().includes('renewConversationLeases'));
    await env.prisma.request.create({
      data: {
        userId: env.userId,
        conversationId: env.conversationId,
        status: 'NEW',
        toolName: 'Curator_Workflow',
        ast: { type: 'Curator_Sequential', name: 'two', subAgents: [1, 2].map(n => ({ type: 'Curator_Tool', toolName: 'echo', args: { text: `t${n}` } })) },
      },
    });
    assert.equal((await processor.stepUntil({ conversationId: env.conversationId })).done, true);
    assert.deepEqual(calls.map(c => c.args.text), ['t1', 't2']);
    assert.ok(await env.prisma.conversationLease.findUnique({ where: { conversationId: env.conversationId } }));

    processor.stop();
    await processor.idle();
    assert.equal(await env.prisma.conversationLease.count(), 0);
  } finally {
    await env.cleanup();
  }
});
