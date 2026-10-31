import { provisionPostgresDb } from '../../src/db/postgresProvisioner.ts';
import { provisionMariadbDb } from '../../src/db/mariadbProvisioner.ts';
import { CuratorRequestProcessor } from '../../src/engine/CuratorRequestProcessor.ts';
import { makeFakeEngine, FIXED_NOW, type TestEnv } from './harness.ts';

export interface ExternalDatabase {
  name: string;
  url: string;
  provision: (url: string) => Promise<any>;
}

/**
 * Real database servers for the storage and checkpoint contract tests, from `CURATOR_TEST_POSTGRES_URL` /
 * `CURATOR_TEST_MARIADB_URL` (unset: those variants are skipped). Every env empties the runtime tables, so point
 * these only at throwaway databases.
 */
export const EXTERNAL_DATABASES: ExternalDatabase[] = [
  { name: 'postgres', url: process.env.CURATOR_TEST_POSTGRES_URL ?? '', provision: (url: string) => provisionPostgresDb(url) },
  { name: 'mariadb', url: process.env.CURATOR_TEST_MARIADB_URL ?? '', provision: (url: string) => provisionMariadbDb(url) },
].filter(db => db.url);

const clients = new Map<string, Promise<any>>();

/** One client per database and test process (provisioning creates the schema once). */
const clientFor = (db: ExternalDatabase): Promise<any> => {
  let client = clients.get(db.name);
  if (!client) clients.set(db.name, (client = db.provision(db.url)));
  return client;
};

async function emptyRuntimeTables(prisma: any): Promise<void> {
  await prisma.response.deleteMany({});
  await prisma.eventLog.deleteMany({});
  await prisma.eventSubscription.deleteMany({ where: { conversationId: { not: null } } });
  await prisma.request.updateMany({ data: { parentId: null } });
  await prisma.request.deleteMany({});
  await prisma.conversation.deleteMany({});
}

/** The harness `TestEnv` on an external database: fresh runtime tables, a tester with the admin role, fake tools. */
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

/** Closes the pools (call from `test.after`, or the test process stays alive on idle connections). */
export async function closeExternalDatabases(): Promise<void> {
  for (const client of clients.values()) await (await client.catch(() => null))?.$disconnect?.();
  clients.clear();
}
