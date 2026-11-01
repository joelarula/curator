import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/db/testDatabase.ts';
import { provisionMemorySqliteDb } from '../../src/db/sqliteProvisioner.ts';
import { appendStatePatch, readSnapshot, stateAt } from '../../src/engine/ConversationStateLog.ts';

// Real servers too when CURATOR_TEST_POSTGRES_URL / CURATOR_TEST_MARIADB_URL are set
const SERVERS = [
  { name: 'postgres', url: process.env.CURATOR_TEST_POSTGRES_URL ?? '' },
  { name: 'mariadb', url: process.env.CURATOR_TEST_MARIADB_URL ?? '' },
].filter(s => s.url);

const TARGETS: Array<[string, () => Promise<{ prisma: any; done: () => Promise<void> }>]> = [
  ['sqlite', async () => {
    const prisma = await provisionMemorySqliteDb();
    return { prisma, done: () => prisma.$disconnect() };
  }],
  ...SERVERS.map((s): [string, () => Promise<{ prisma: any; done: () => Promise<void> }>] => [s.name, async () => {
    const db = await createTestDatabase(s.url);
    return { prisma: db.prisma, done: () => db.drop() };
  }]),
];

for (const [target, open] of TARGETS) {
  test(`state log (${target}): concurrent writers to one conversation all land in the snapshot`, async () => {
    const { prisma, done } = await open();
    try {
      const user = await prisma.user.upsert({ where: { email: 'system@local' }, update: {}, create: { id: 'system', name: 'System', email: 'system@local' } });
      const { id } = await prisma.conversation.create({ data: { userId: user.id } });
      // Without the row lock, two writers folded the same old snapshot and the later update dropped the other's event
      await Promise.all(Array.from({ length: 20 }, (_, i) => appendStatePatch(prisma, id, { set: { [`k${i}`]: i } })));
      const snapshot = readSnapshot((await prisma.conversation.findUnique({ where: { id } })).metadata);
      assert.deepEqual(Object.keys(snapshot.state).sort(), Array.from({ length: 20 }, (_, i) => `k${i}`).sort());
      assert.deepEqual(snapshot.state, await stateAt(prisma, id), 'the snapshot equals the fold of the log');
      const last = await prisma.eventLog.findFirst({ where: { conversationId: id }, orderBy: { id: 'desc' } });
      assert.equal(snapshot.seq, last.id, 'the snapshot is at the last event');
    } finally {
      await done();
    }
  });
}
