export async function startCuratorRuntime({ databaseName = 'keeris', intervalMs = 1000, logger = console } = {}) {
  if (!databaseName) return null;

  const { provisionSqliteDb } = await import('@curator/agent-server');
  const prisma = await provisionSqliteDb(databaseName, false, {
    databasePath: process.env.CURATOR_DATABASE_PATH ?? 'data/curator.db',
  });

  const user = await prisma.user.upsert({ where: { email: 'system@local' }, update: {}, create: { id: '1', name: 'System User', email: 'system@local' } });
  const project = await prisma.project.upsert({ where: { id: '1' }, update: {}, create: { id: '1', name: 'Keeris', userId: user.id } });
  let conversation = await prisma.conversation.findFirst({ where: { userId: user.id, projectId: project.id } });
  if (!conversation) {
    conversation = await prisma.conversation.create({ data: { userId: user.id, projectId: project.id } });
  }

  logger.log('[Keeris] Curator database connection established.');

  return {
    prisma,
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
      await prisma.$disconnect();
    },
  };
}