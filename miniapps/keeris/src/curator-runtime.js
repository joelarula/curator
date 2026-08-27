export async function startCuratorRuntime({ databaseName, keerisDb, intervalMs = 1000, logger = console } = {}) {
  if (!databaseName) return null;

  const { provisionSqliteDb } = await import('@curator/agent-server');
  const { CuratorRequestProcessor } = await import('@curator/agent-server');
  const { ScheduledAgentScheduler, setGlobalScheduler } = await import('@curator/agent-server/dist/src/engine/ScheduledAgentScheduler.js');
  const prisma = await provisionSqliteDb(databaseName, false, {
    databasePath: process.env.CURATOR_DATABASE_PATH,
  });
  const processor = new CuratorRequestProcessor(prisma);
  await processor.start(intervalMs);
  const scheduler = new ScheduledAgentScheduler(prisma);
  setGlobalScheduler(scheduler);

  const agent = await prisma.agent.findFirst({ where: { name: 'keeris_kauamangiv_scrape' } });
  const workflow = await prisma.agentWorkflow.findUnique({ where: { name: 'keeris_kauamangiv_scrape' } });
  const scheduledAgent = agent && workflow && await prisma.scheduledAgent.findFirst({ where: { name: 'keeris-kauamangiv-hourly', isActive: true } });
  if (agent && workflow && !scheduledAgent) {
    await prisma.scheduledAgent.create({
      data: { name: 'keeris-kauamangiv-hourly', workflowName: workflow.name, schedule: process.env.KEERIS_SCRAPE_SCHEDULE ?? '0 * * * *', userId: agent.userId, projectId: agent.projectId, isActive: true },
    });
  }
  const migrationAgent = await prisma.agent.findFirst({ where: { name: 'keeris_legacy_migration' } });
  const migrationWorkflow = await prisma.agentWorkflow.findUnique({ where: { name: 'keeris_legacy_migration' } });
  if (process.env.KEERIS_MIGRATE_LEGACY === 'true' && migrationAgent && migrationWorkflow) {
    const alreadyScheduled = await prisma.scheduledAgent.findFirst({ where: { name: 'keeris-legacy-migration', isActive: true } });
    if (!alreadyScheduled) {
      await prisma.scheduledAgent.create({
        data: { name: 'keeris-legacy-migration', workflowName: migrationWorkflow.name, runOnce: true, runAt: new Date(Date.now() + 1000), userId: migrationAgent.userId, projectId: migrationAgent.projectId, isActive: true },
      });
    }
  }
  await scheduler.start();

  logger.log('[Keeris] Curator processor and scheduled-agent scheduler are running.');
  return {
    prisma,
    processor,
    scheduler,
    async stop() {
      processor.stop();
      await scheduler.stop();
      await prisma.$disconnect();
    },
  };
}