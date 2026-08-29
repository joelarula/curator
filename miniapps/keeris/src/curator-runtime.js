import { registerKeerisPlugins } from './plugins/index.js';

export async function startCuratorRuntime({ databaseName = 'keeris', keerisDb, intervalMs = 1000, logger = console } = {}) {
  if (!databaseName) return null;

  if (keerisDb) {
    await registerKeerisPlugins({ db: keerisDb });
  }

  const { provisionSqliteDb, CuratorRequestProcessor } = await import('@curator/agent-server');
  const prisma = await provisionSqliteDb(databaseName, false, {
    databasePath: process.env.CURATOR_DATABASE_PATH ?? 'data/curator.db',
  });

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
    async triggerAgent(name, context = {}) {
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