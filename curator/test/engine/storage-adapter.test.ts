import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, type TestEnv } from '../helpers/harness.ts';
import { EXTERNAL_DATABASES, externalEnv, closeExternalDatabases } from '../helpers/externalDb.ts';
import { MemoryStorageAdapter } from '../../src/storage/MemoryStorageAdapter.ts';
import { PrismaStorageAdapter } from '../../src/storage/PrismaStorageAdapter.ts';
import type { IStorageAdapter, StorageScope } from '../../src/storage/IStorageAdapter.ts';

const NOW = new Date('2026-01-01T12:00:00Z');
const clock = () => NOW.getTime();
const LATER = new Date(NOW.getTime() + 60_000);

interface Fixture {
  store: (scope?: StorageScope) => IStorageAdapter;
  /** A conversation owned by `projectId` (null: global). */
  conversation: (projectId: string | null) => Promise<number>;
  userId: string;
  cleanup: () => Promise<void>;
}

const memoryFixture = async (): Promise<Fixture> => {
  const root = new MemoryStorageAdapter(undefined, clock);
  let conversations = 0;
  return {
    store: scope => (scope ? root.withScope(scope) : root),
    conversation: async projectId => {
      root.registerConversation(++conversations, projectId);
      return conversations;
    },
    userId: 'u1',
    cleanup: () => root.close(),
  };
};

const prismaFixture = (makeEnv: () => Promise<TestEnv>) => async (): Promise<Fixture> => {
  const env = await makeEnv();
  for (const id of ['system', 'p1', 'p2']) {
    await env.prisma.project.upsert({ where: { id }, update: {}, create: { id, name: id, userId: env.userId } });
  }
  return {
    store: scope => new PrismaStorageAdapter(env.prisma, { scope, clock }),
    conversation: async projectId => (await env.prisma.conversation.create({ data: { userId: env.userId, projectId } })).id,
    userId: env.userId,
    cleanup: () => env.cleanup(),
  };
};

// Real servers too when CURATOR_TEST_POSTGRES_URL / CURATOR_TEST_MARIADB_URL are set (a throwaway database each)
const FIXTURES: Array<[string, () => Promise<Fixture>]> = [
  ['memory', memoryFixture],
  ['prisma/sqlite', prismaFixture(() => createEnv('storage_adapter'))],
  ...EXTERNAL_DATABASES.map((db): [string, () => Promise<Fixture>] => [`prisma/${db.name}`, prismaFixture(() => externalEnv(db))]),
];
test.after(closeExternalDatabases);

for (const [name, makeFixture] of FIXTURES) {
  test(`storage (${name}): claims runnable requests by priority, once, and never early or blocked ones`, async () => {
    const fx = await makeFixture();
    try {
      const conv = await fx.conversation('p1');
      const store = fx.store();
      const base = { userId: fx.userId, projectId: 'p1', conversationId: conv, scheduledAt: NOW };
      const low = await store.requests.create({ ...base, priority: 0 });
      const high = await store.requests.create({ ...base, priority: 5 });
      await store.requests.create({ ...base, scheduledAt: LATER });
      await store.requests.create({ ...base, pendingDependencies: 1 });

      const claimed = await store.requests.claim('w1', { limit: 10 });
      assert.deepEqual(claimed.map(r => r.id), [high.id, low.id]);
      assert.ok(claimed.every(r => r.status === 'WAITING' && r.lockedBy === 'w1'));
      assert.deepEqual(await store.requests.claim('w2', { limit: 10 }), []);
      assert.equal((await store.requests.claim('w2', { limit: 10, now: LATER })).length, 1);
    } finally {
      await fx.cleanup();
    }
  });

  test(`storage (${name}): concurrent claims never hand out the same request twice`, async () => {
    const fx = await makeFixture();
    try {
      const conv = await fx.conversation('p1');
      const store = fx.store();
      for (let i = 0; i < 6; i++) await store.requests.create({ userId: fx.userId, projectId: 'p1', conversationId: conv, scheduledAt: NOW });
      // Under contention a worker may get fewer than it asked for (SQLite: it lost the conditional update),
      // but no request is ever handed to two workers, and the rest is claimable afterwards.
      const rounds = await Promise.all(['w1', 'w2', 'w3'].map(w => store.requests.claim(w, { limit: 4 })));
      const ids = rounds.flat().map(r => r.id);
      assert.equal(new Set(ids).size, ids.length);
      const rest = await store.requests.claim('w4', { limit: 10 });
      assert.equal(ids.length + rest.length, 6);
      assert.equal(new Set([...ids, ...rest.map(r => r.id)]).size, 6);
    } finally {
      await fx.cleanup();
    }
  });

  test(`storage (${name}): dependencyDone wakes a parent at zero and never unlocks a claimed request`, async () => {
    const fx = await makeFixture();
    try {
      const conv = await fx.conversation('p1');
      const store = fx.store();
      const base = { userId: fx.userId, projectId: 'p1', conversationId: conv, scheduledAt: NOW };
      const parent = await store.requests.create({ ...base, status: 'WAITING', pendingDependencies: 2 });
      assert.equal((await store.requests.dependencyDone(parent.id))?.status, 'WAITING');
      const woken = await store.requests.dependencyDone(parent.id);
      assert.equal(woken?.status, 'NEW');
      assert.equal(woken?.pendingDependencies, 0);

      const [running] = await store.requests.claim('w1', { limit: 1 });
      const after = await store.requests.dependencyDone(running.id);
      assert.equal(after?.status, 'WAITING');
      assert.equal(after?.lockedBy, 'w1');

      await store.requests.update(running.id, { status: 'COMPLETED' });
      assert.equal(await store.requests.dependencyDone(running.id), null);
    } finally {
      await fx.cleanup();
    }
  });

  test(`storage (${name}): update clears JSON to null; stale locks are released`, async () => {
    const fx = await makeFixture();
    try {
      const conv = await fx.conversation('p1');
      const store = fx.store();
      const req = await store.requests.create({ userId: fx.userId, projectId: 'p1', conversationId: conv, scheduledAt: NOW, context: { a: 1 } });
      assert.deepEqual((await store.requests.get(req.id))?.context, { a: 1 });
      assert.equal((await store.requests.update(req.id, { context: null })).context, null);

      await store.requests.claim('w1', { limit: 1 });
      assert.equal(await store.requests.releaseStale(new Date(NOW.getTime() - 1)), 0);
      assert.equal(await store.requests.releaseStale(LATER), 1);
      assert.equal((await store.requests.get(req.id))?.status, 'NEW');
    } finally {
      await fx.cleanup();
    }
  });

  test(`storage (${name}): responses and events replay in order from a cursor`, async () => {
    const fx = await makeFixture();
    try {
      const conv = await fx.conversation('p1');
      const store = fx.store();
      const req = await store.requests.create({ userId: fx.userId, projectId: 'p1', conversationId: conv, scheduledAt: NOW });
      await store.responses.append({ requestId: req.id, conversationId: conv, projectId: 'p1', content: 'first' });
      await store.responses.append({ requestId: req.id, conversationId: conv, projectId: 'p1', content: 'second' });
      assert.equal((await store.responses.latest(req.id))?.content, 'second');
      assert.deepEqual((await store.responses.listForRequest(req.id)).map(r => r.content), ['first', 'second']);

      const first = await store.events.append({ conversationId: conv, eventName: 'a', payload: { n: 1 }, source: req.id });
      await store.events.append({ conversationId: conv, eventName: 'b', payload: { n: 2 } });
      await store.events.append({ conversationId: conv, eventName: 'a', payload: { n: 3 } });
      assert.deepEqual((await store.events.after(conv, first.id)).map(e => e.payload), [{ n: 2 }, { n: 3 }]);
      assert.deepEqual((await store.events.after(conv, 0, { eventNames: ['a'], limit: 1 })).map(e => e.source), [req.id]);
    } finally {
      await fx.cleanup();
    }
  });

  test(`storage (${name}): a scoped store reads its projects, system and global rows, and writes only its projects`, async () => {
    const fx = await makeFixture();
    try {
      const own = await fx.conversation('p1');
      const other = await fx.conversation('p2');
      const unscoped = fx.store();
      const base = { userId: fx.userId, scheduledAt: NOW };
      const foreign = await unscoped.requests.create({ ...base, projectId: 'p2', conversationId: other });
      await unscoped.events.append({ conversationId: other, eventName: 'secret' });

      const scoped = fx.store({ projectIds: ['p1'] });

      await assert.rejects(scoped.requests.create({ ...base, projectId: 'p2', conversationId: other }), /outside the active scope/);
      await assert.rejects(scoped.requests.create({ ...base, projectId: null, conversationId: own }), /outside the active scope/);
      const mine = await scoped.requests.create({ ...base, projectId: 'p1', conversationId: own });
      const system = await scoped.requests.create({ ...base, projectId: 'system', conversationId: own });
      const global = await unscoped.requests.create({ ...base, projectId: null, conversationId: own });
      await assert.rejects(scoped.events.append({ conversationId: other, eventName: 'x' }), /outside the active scope/);
      assert.deepEqual(await scoped.events.after(other, 0), []);
      assert.equal(await scoped.requests.get(foreign.id), null);
      await assert.rejects(scoped.requests.update(foreign.id, { priority: 9 }));

      const claimed = await scoped.requests.claim('w1', { limit: 10 });
      assert.deepEqual(claimed.map(r => r.id).sort((x, y) => x - y), [mine.id, system.id, global.id]);
    } finally {
      await fx.cleanup();
    }
  });
}
