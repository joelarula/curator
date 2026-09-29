import { CuratorRequestProcessor } from '@curator/agent-server';
import { provisionMariadbDb } from '../../../curator/src/db/mariadbProvisioner.ts';
import { registerKeerisPlugins } from './plugins/index.ts';
import { seedCuratorRbac } from '@curator/plugin-auth';

export interface StartCuratorRuntimeOptions {
  databaseName?: string;
  keerisDb?: any;
  intervalMs?: number;
  logger?: { log: (...args: any[]) => void; error: (...args: any[]) => void };
}

export async function startCuratorRuntime({
  databaseName = 'keeris',
  keerisDb,
  intervalMs = 5000,
  logger = console,
}: StartCuratorRuntimeOptions = {}) {
  if (!databaseName) return null;

  if (keerisDb) {
    await registerKeerisPlugins({ db: keerisDb });
  }

  const curatorDbUrl = process.env.CURATOR_DATABASE_URL || process.env.DATABASE_URL;
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

  // Seed curator_manager role and assign to joel.arula@gmail.com
  await seedCuratorManagerRole(prisma, logger);

  const { curatorEvents } = await import('./server/events.ts');

  const processor = new (CuratorRequestProcessor as any)(prisma, {
    onEvent: (type: string, payload: any) => {
      curatorEvents.broadcast(type, payload);
      if (type === 'request_done') {
        curatorEvents.broadcast('database_change', { tables: ['requests', 'responses', 'agents', 'episodes', 'tracks', 'stats'] });
      }
    }
  });
  await processor.start(intervalMs);

  logger.log('[Keeris] Curator database connection established and RequestProcessor active.');

  return {
    prisma,
    processor,
    async triggerAgent(name: string, context: Record<string, any> = {}) {
      const agent = await prisma.agent.findFirst({
        where: { OR: [{ id: name }, { name }], existent: true },
        include: { script: true }
      });
      if (agent && agent.enabled === false) {
        throw new Error(`Cannot trigger agent '${agent.name}': agent is disabled. Please enable it before running.`);
      }
      const script = agent?.script || await prisma.script.findFirst({ where: { name } });
      if (!script) throw new Error(`Curator script for agent '${name}' not found`);
      return prisma.request.create({
        data: {
          user: { connect: { id: user.id } },
          project: { connect: { id: project.id } },
          conversation: { connect: { id: conversation.id } },
          script: { connect: { id: script.id } },
          ...(agent ? { agent: { connect: { id: agent.id } } } : {}),
          ast: script.ast,
          context,
          scheduledAt: new Date(),
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

async function seedCuratorManagerRole(prisma: any, logger: any) {
  try {
    await seedCuratorRbac(prisma, {
      managers: ['joel.arula@gmail.com'],
      logger: {
        info: (msg) => logger.log?.(`[Keeris] ${msg}`),
        warn: (msg) => logger.warn?.(`[Keeris] ${msg}`),
        error: (msg) => logger.error?.(`[Keeris] ${msg}`),
      },
    });
  } catch (err: any) {
    logger.warn?.(`[Keeris] Role seeding notice: ${err?.message}`);
  }
}


