import { CuratorRequestProcessor } from '@curator/agent-server';
import { provisionMariadbDb } from '../../../curator/src/db/mariadbProvisioner.ts';
import { registerKeerisPlugins } from './plugins/index.ts';

export interface StartCuratorRuntimeOptions {
  databaseName?: string;
  keerisDb?: any;
  intervalMs?: number;
  logger?: { log: (...args: any[]) => void; error: (...args: any[]) => void };
}

export async function startCuratorRuntime({
  databaseName = 'keeris',
  keerisDb,
  intervalMs = 1000,
  logger = console,
}: StartCuratorRuntimeOptions = {}) {
  if (!databaseName) return null;

  if (keerisDb) {
    await registerKeerisPlugins({ db: keerisDb });
  }

  const curatorDbUrl = process.env.CURATOR_DATABASE_URL || 'mysql://sepisedc_curator:curator_secret@localhost:3306/sepisedc_curator_keeris';
  let prisma: any;
  if (curatorDbUrl && (curatorDbUrl.startsWith('mysql://') || curatorDbUrl.startsWith('mariadb://'))) {
    prisma = await provisionMariadbDb(curatorDbUrl);
  } else {
    const { provisionSqliteDb }: any = await import('../../../curator/src/db/sqliteProvisioner.ts');
    prisma = await provisionSqliteDb(databaseName, false, {
      databasePath: process.env.CURATOR_DATABASE_PATH ?? 'data/curator.db',
    });
  }

  const user = await prisma.user.upsert({ where: { email: 'system@local' }, update: {}, create: { id: '1', name: 'System User', email: 'system@local' } });
  const project = await prisma.project.upsert({ where: { id: '1' }, update: {}, create: { id: '1', name: 'Keeris', userId: user.id } });
  let conversation = await prisma.conversation.findFirst({ where: { userId: user.id, projectId: project.id } });
  if (!conversation) {
    conversation = await prisma.conversation.create({ data: { userId: user.id, projectId: project.id } });
  }

  const processor = new CuratorRequestProcessor(prisma);
  await processor.start(intervalMs);

  logger.log('[Keeris] Curator database connection established and RequestProcessor active.');

  return {
    prisma,
    processor,
    async triggerAgent(name: string, context: Record<string, any> = {}) {
      const script = await prisma.script.findFirst({ where: { name } });
      if (!script) throw new Error(`Curator script '${name}' not found`);
      return prisma.request.create({
        data: {
          user: { connect: { id: user.id } },
          project: { connect: { id: project.id } },
          conversation: { connect: { id: conversation.id } },
          script: { connect: { id: script.id } },
          ast: script.ast,
          context,
        },
      });
    },
    async stop() {
      if (processor && typeof processor.stop === 'function') {
        processor.stop();
      }
      await prisma.$disconnect();
    },
  };
}
