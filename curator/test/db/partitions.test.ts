import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../../src/db/testDatabase.ts';
import { prismaSchemaDb } from '../../src/db/schemaSql.ts';
import { sqlDialect } from '../../src/db/sqlDialect.ts';
import { convergePartitions, isPartitioned, maintainPartitions, PARTITIONED_TABLES } from '../../src/db/partitions.ts';
import { StepTraceWriter } from '../../src/engine/StepTrace.ts';
import { provisionMemorySqliteDb } from '../../src/db/sqliteProvisioner.ts';

// Partitions exist only on real servers: run with CURATOR_TEST_POSTGRES_URL / CURATOR_TEST_MARIADB_URL
const SERVERS = [
  { name: 'postgres', url: process.env.CURATOR_TEST_POSTGRES_URL ?? '' },
  { name: 'mariadb', url: process.env.CURATOR_TEST_MARIADB_URL ?? '' },
].filter(s => s.url);

const DAY = 24 * 60 * 60 * 1000;
const stepTrace = PARTITIONED_TABLES.find(t => t.table === 'StepTrace')!;
const utcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const row = (createdAt: Date, requestId: number) => ({ createdAt, requestId, conversationId: 1, status: 'COMPLETED', worker: 'w' });

for (const server of SERVERS) {
  test(`partitions (${server.name}): a new database gets StepTrace partitioned by day; old days are dropped, new ones added`, async () => {
    const db = await createTestDatabase(server.url);
    try {
      const prisma = db.prisma;
      const schemaDb = prismaSchemaDb(prisma, sqlDialect(prisma));
      assert.equal(await isPartitioned(schemaDb, stepTrace), true, 'partitioned when the database was provisioned');
      assert.deepEqual((await convergePartitions(schemaDb)).converted, [], 'converging again changes nothing');

      const today = utcDay(new Date());
      await prisma.stepTrace.createMany({
        data: [row(new Date(today.getTime() - DAY + 1000), 1), row(new Date(today.getTime() + 1000), 2), row(new Date(today.getTime() + 2 * DAY + 1000), 3)],
      });
      assert.equal(await prisma.stepTrace.count(), 3);

      // Three days later, keeping one day: yesterday's and today's partitions go, the coming days get theirs
      const later = new Date(today.getTime() + 3 * DAY + 60_000);
      const result = await maintainPartitions(schemaDb, { retainDays: 1, now: later });
      assert.deepEqual(result.failed, []);
      assert.ok(result.created.length >= 2, `created ${result.created}`);
      assert.ok(result.dropped.length >= 2, `dropped ${result.dropped}`);
      assert.deepEqual((await prisma.stepTrace.findMany({ select: { requestId: true } })).map((r: any) => r.requestId), [3]);

      // A row far in the future lands in the catch-all partition instead of failing
      await prisma.stepTrace.create({ data: row(new Date(today.getTime() + 400 * DAY), 4) });
      assert.equal(await prisma.stepTrace.count(), 2);
      assert.deepEqual((await maintainPartitions(schemaDb, { retainDays: 1, now: later })).dropped, [], 'a second run drops nothing more');
    } finally {
      await db.drop();
    }
  });

  test(`partitions (${server.name}): a table that cannot be converted automatically is reported, not changed`, async () => {
    const db = await createTestDatabase(server.url);
    try {
      const prisma = db.prisma;
      const schemaDb = prismaSchemaDb(prisma, sqlDialect(prisma));
      // EventLog has rows (Postgres cannot convert those in place) and a primary key without the time column
      await prisma.eventLog.create({ data: { conversationId: 1, eventName: 'x' } });
      const eventLog = { table: 'EventLog', column: 'createdAt' };
      const result = await convergePartitions(schemaDb, {}, [eventLog]);
      assert.deepEqual(result.converted, []);
      assert.equal(result.manual.length + result.failed.length, 1);
      assert.equal(await isPartitioned(schemaDb, eventLog), false);
      assert.equal(await prisma.eventLog.count(), 1);
    } finally {
      await db.drop();
    }
  });

  test(`partitions (${server.name}): StepTraceWriter.retire drops partitions instead of deleting rows`, async () => {
    const db = await createTestDatabase(server.url);
    try {
      const prisma = db.prisma;
      const today = utcDay(new Date());
      await prisma.stepTrace.createMany({ data: [row(new Date(today.getTime() - DAY + 1000), 1), row(new Date(today.getTime() + 1000), 2)] });
      await new StepTraceWriter(prisma).retire(DAY, new Date(today.getTime() + DAY + 60_000));
      assert.deepEqual((await prisma.stepTrace.findMany({ select: { requestId: true } })).map((r: any) => r.requestId), [2]);
    } finally {
      await db.drop();
    }
  });
}

test('partitions (sqlite): nothing to partition; StepTraceWriter.retire deletes old rows', async () => {
  const prisma = await provisionMemorySqliteDb();
  try {
    const schemaDb = prismaSchemaDb(prisma, 'sqlite');
    assert.deepEqual(await convergePartitions(schemaDb), { converted: [], created: [], dropped: [], manual: [], failed: [] });
    const now = new Date();
    await prisma.stepTrace.createMany({ data: [row(new Date(now.getTime() - 3 * DAY), 1), row(now, 2)] });
    await new StepTraceWriter(prisma).retire(DAY, now);
    assert.deepEqual((await prisma.stepTrace.findMany({ select: { requestId: true } })).map((r: any) => r.requestId), [2]);
  } finally {
    await prisma.$disconnect();
  }
});
