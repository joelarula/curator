import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/db/testDatabase.ts';
import { prismaSchemaDb } from '../../src/db/schemaSql.ts';
import { sqlDialect } from '../../src/db/sqlDialect.ts';
import { isPartitioned, PARTITIONED_TABLES } from '../../src/db/partitions.ts';
import { migrateBusEvents } from '../../src/db/busEvents.ts';
import { provisionMemorySqliteDb } from '../../src/db/sqliteProvisioner.ts';

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
  test(`bus events (${target}): an old EventLog's dispatched events move to BusEvent with their ids; new ids start above it`, async () => {
    const { prisma, done } = await open();
    try {
      const db = prismaSchemaDb(prisma, sqlDialect(prisma));
      // Before BusEvent: dispatched and state events shared EventLog and its ids
      for (const eventName of ['game:move', '__state.patch', 'agent:message', '__state.patch']) {
        await prisma.eventLog.create({ data: { conversationId: 7, eventName, payload: { eventName } } });
      }
      const log = await prisma.eventLog.findMany({ orderBy: { id: 'asc' } });
      const maxLog = log.at(-1).id;

      const result = await migrateBusEvents(db);
      assert.deepEqual(result, { copied: 2, startsAt: maxLog + 1 });
      const moved = await prisma.busEvent.findMany({ orderBy: { id: 'asc' } });
      assert.deepEqual(moved.map((e: any) => [e.id, e.eventName]), log.filter((e: any) => !e.eventName.startsWith('__state.')).map((e: any) => [e.id, e.eventName]));
      assert.deepEqual((await prisma.eventLog.findMany()).map((e: any) => e.eventName), ['__state.patch', '__state.patch']);

      // A cursor at the last old id (a state event's) is below every new event
      const next = await prisma.busEvent.create({ data: { conversationId: 7, eventName: 'game:move' } });
      assert.ok(next.id > maxLog, `new id ${next.id} above ${maxLog}`);
      assert.equal(await migrateBusEvents(db), null, 'runs once');
    } finally {
      await done();
    }
  });

  test(`bus events (${target}): a new database has nothing to move`, async () => {
    const { prisma, done } = await open();
    try {
      const db = prismaSchemaDb(prisma, sqlDialect(prisma));
      assert.equal(await migrateBusEvents(db), null);
      if (target !== 'sqlite') {
        assert.equal(await isPartitioned(db, PARTITIONED_TABLES.find(t => t.table === 'BusEvent')!), true, 'partitioned by day');
      }
    } finally {
      await done();
    }
  });
}
