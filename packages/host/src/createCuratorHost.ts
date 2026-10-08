import path from 'node:path';
import {
  provisionSqliteDb,
  provisionMariadbDb,
  CuratorRequestProcessor,
  curatorEngine,
} from '@curator/agent-server';
import { CuratorHostEvents } from './events/CuratorHostEvents.js';
import { seedAgentsAndTools } from './seed/seedAgentsAndTools.js';
import type { CuratorHost, CuratorHostConfig, SeedResult } from './types.js';

export async function createCuratorHost(config: CuratorHostConfig): Promise<CuratorHost> {
  const name = config.name || 'curator';
  const dataDir = config.dataDir ?? process.env.DATA_DIR ?? './data';
  const logger = config.logger ?? console;

  // 1. Resolve database connection / path
  const curatorDbUrl = config.curatorDb?.url ?? process.env.CURATOR_DATABASE_URL ?? process.env.DATABASE_URL;
  let prisma: any;
  let databasePath: string | undefined;

  if (curatorDbUrl && (curatorDbUrl.startsWith('mysql://') || curatorDbUrl.startsWith('mariadb://'))) {
    prisma = await provisionMariadbDb(curatorDbUrl);
  } else {
    databasePath = config.curatorDb?.path ?? process.env.CURATOR_DATABASE_PATH ?? path.join(dataDir, 'state', 'curator.db');
    prisma = await provisionSqliteDb(name, false, { databasePath });
  }

  // 2. Ensure system user, project and conversation scoping exist
  const user = await prisma.user.upsert({
    where: { email: 'system@local' },
    update: {},
    create: { id: '1', name: 'System User', email: 'system@local' },
  });

  const project = await prisma.project.upsert({
    where: { id: '1' },
    update: {},
    create: { id: '1', name, userId: user.id },
  });

  let conversation = await prisma.conversation.findFirst({
    where: { userId: user.id, projectId: project.id },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { userId: user.id, projectId: project.id },
    });
  }

  // 3. Register plugins into CuratorEngine
  let registeredEngine = curatorEngine;
  if (config.registerPlugins) {
    const customEngine = await config.registerPlugins({
      dataDir,
      domainDb: config.domainDb,
    });
    if (customEngine) {
      registeredEngine = customEngine;
    }
  }

  // 4. Instantiate event bus
  const events = new CuratorHostEvents();

  // 5. Instantiate RequestProcessor
  const processor = new (CuratorRequestProcessor as any)(prisma, {
    onEvent: (type: string, payload: any) => {
      events.broadcast(type, payload);
      if (type === 'request_done') {
        events.broadcast('database_change', {
          tables: ['requests', 'responses', 'agents'],
        });
      }
    },
  });

  const host: CuratorHost = {
    config,
    events,
    prisma,
    processor,
    engine: registeredEngine,

    async start(intervalMs?: number): Promise<void> {
      const interval = intervalMs ?? config.intervalMs ?? 3000;
      await processor.start(interval);
      logger.info?.(`[CuratorHost:${name}] RequestProcessor polling started (${interval}ms)`);
    },

    async stop(): Promise<void> {
      if (processor && typeof processor.stop === 'function') {
        processor.stop();
      }
      events.close();
      if (prisma && typeof prisma.$disconnect === 'function') {
        await prisma.$disconnect();
      }
      logger.info?.(`[CuratorHost:${name}] Host stopped cleanly`);
    },

    async gracefulShutdown(): Promise<void> {
      await host.stop();
    },

    async seed(): Promise<SeedResult> {
      const result = await seedAgentsAndTools(prisma, registeredEngine, {
        projectName: name,
        logger,
        rbacManagers: config.rbac?.managers,
      });
      return {
        ...result,
        databasePath,
      };
    },

    async triggerAgent(agentName: string, context: Record<string, any> = {}): Promise<any> {
      const agent = await prisma.agent.findFirst({
        where: { OR: [{ id: agentName }, { name: agentName }], existent: true },
        include: { script: true },
      });

      if (agent && agent.enabled === false) {
        throw new Error(
          `Cannot trigger agent '${agent.name}': agent is disabled. Please enable it before running.`
        );
      }

      const script = agent?.script || (await prisma.script.findFirst({ where: { name: agentName } }));
      if (!script) {
        throw new Error(`Curator script or workflow for agent '${agentName}' not found`);
      }

      const request = await prisma.request.create({
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

      events.broadcast('request_start', { requestId: request.id, agent: agentName });
      return request;
    },

    async pauseRequest(requestId: number | string): Promise<any> {
      const id = typeof requestId === 'string' ? parseInt(requestId, 10) : requestId;
      const updated = await prisma.request.update({
        where: { id },
        data: { status: 'PAUSED', lockedBy: null, lockedAt: null },
      });
      events.broadcast('request_paused', { requestId: id });
      return updated;
    },

    async resumeRequest(requestId: number | string): Promise<any> {
      const id = typeof requestId === 'string' ? parseInt(requestId, 10) : requestId;
      const updated = await prisma.request.update({
        where: { id },
        data: { status: 'NEW', lockedBy: null, lockedAt: null },
      });
      events.broadcast('request_resumed', { requestId: id });
      return updated;
    },
  };

  return host;
}
