import { createTestDatabase, type TestDatabase } from '../../src/db/testDatabase.ts';
import { CuratorRequestProcessor } from '../../src/engine/CuratorRequestProcessor.ts';
import { makeFakeEngine, FIXED_NOW, type TestEnv } from './harness.ts';

export interface ExternalDatabase {
  name: string;
  /** Server URL; its database is only used to create and drop the test database. */
  url: string;
}

/**
 * Real database servers for the storage, lease and checkpoint tests, from `CURATOR_TEST_POSTGRES_URL` /
 * `CURATOR_TEST_MARIADB_URL` (unset: those variants are skipped). Each test process creates its own database on
 * the server (`createTestDatabase`, `curator_test_<random>`) and drops it in `closeExternalDatabases`, so no
 * existing database is ever read or changed.
 */
export const EXTERNAL_DATABASES: ExternalDatabase[] = [
  { name: 'postgres', url: process.env.CURATOR_TEST_POSTGRES_URL ?? '' },
  { name: 'mariadb', url: process.env.CURATOR_TEST_MARIADB_URL ?? '' },
].filter(db => db.url);

const databases = new Map<string, Promise<TestDatabase>>();

/** One test database per server and test process. */
const clientFor = async (db: ExternalDatabase): Promise<any> => {
  let database = databases.get(db.name);
  if (!database) databases.set(db.name, (database = createTestDatabase(db.url)));
  return (await database).prisma;
};

async function emptyRuntimeTables(prisma: any): Promise<void> {
  await prisma.response.deleteMany({});
  await prisma.eventLog.deleteMany({});
  await prisma.busEvent.deleteMany({});
  await prisma.eventSubscription.deleteMany({ where: { conversationId: { not: null } } });
  await prisma.request.updateMany({ data: { parentId: null } });
  await prisma.request.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.conversationLease.deleteMany({});
  await prisma.stepTrace.deleteMany({});
}

/** Connection URL of this process's test database on `db` (e.g. for a LISTEN connection). */
export async function externalDatabaseUrl(db: ExternalDatabase): Promise<string> {
  await clientFor(db);
  return (await databases.get(db.name)!).url;
}

/** The harness `TestEnv` on this process's test database: emptied runtime tables, a tester with the admin role, fake tools. */
export async function externalEnv(
  db: ExternalDatabase,
  canned: Record<string, (args: any) => any> = {},
  processorOptions: Record<string, any> = {}
): Promise<TestEnv> {
  const prisma = await clientFor(db);
  await emptyRuntimeTables(prisma);
  const user = await prisma.user.upsert({
    where: { email: 'tester@example.com' },
    update: {},
    create: { id: 'tester', name: 'Tester', email: 'tester@example.com' },
  });
  await prisma.role.upsert({ where: { id: 'admin' }, update: {}, create: { id: 'admin', name: 'admin' } });
  if (!(await prisma.userRole.findFirst({ where: { userId: user.id, roleId: 'admin', projectId: null } }))) {
    await prisma.userRole.create({ data: { userId: user.id, roleId: 'admin' } });
  }
  const conversation = await prisma.conversation.create({ data: { userId: user.id } });
  const { engine, calls } = makeFakeEngine(canned);
  const retention = { completedContext: 'keep', ...processorOptions.retention };
  const processor = new CuratorRequestProcessor(prisma, { engine, now: () => FIXED_NOW, ...processorOptions, retention } as any);
  return {
    prisma,
    processor,
    conversationId: conversation.id,
    userId: user.id,
    calls,
    useLlm: () => {
      throw new Error('useLlm is not supported on external databases');
    },
    setConfig: () => {},
    cleanup: async () => {},
  };
}

/** Drops this process's test databases (call from `test.after`). */
export async function closeExternalDatabases(): Promise<void> {
  for (const database of databases.values()) await (await database.catch(() => null))?.drop();
  databases.clear();
}
