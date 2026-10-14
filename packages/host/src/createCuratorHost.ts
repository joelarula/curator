import path from 'node:path';
import {
  provisionSqliteDb,
  provisionMariadbDb,
  CuratorRequestProcessor,
  curatorEngine,
  ConversationManager,
  ConversationRouter,
} from '../../../curator/dist/src/index.js';
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

  // 6. Instantiate ConversationManager & ConversationRouter for native intra-node agent communication
  const convManager = new ConversationManager({
    prisma,
    defaultProjectId: project.id,
    defaultUserId: user.id,
  });

  const conversations = new ConversationRouter({
    localNodeId: name,
    localProjectId: project.id,
    manager: convManager,
    prisma,
  });

  function parseDurationMs(duration: string | number): number {
    if (typeof duration === 'number') return duration;
    const match = duration.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
    if (!match) return 300000;
    const val = parseFloat(match[1]);
    const unit = (match[2] || 'm').toLowerCase();
    switch (unit) {
      case 'ms': return val;
      case 's': return val * 1000;
      case 'm': return val * 60 * 1000;
      case 'h': return val * 3600 * 1000;
      case 'd': return val * 86400 * 1000;
      default: return val * 60 * 1000;
    }
  }

  // Wire host events with ConversationRouter for local loopback & intra-node message passing
  events.onEvent((event: any) => {
    if (event.type === 'agent:message' || event.type === 'mesh:agent:message') {
      conversations.routeInbound(event.payload).catch((err) => {
        logger.warn?.(`[CuratorHost:${name}] Failed to route inbound agent message:`, err);
      });
    } else if (event.type === 'agent:lease:grant') {
      const p = event.payload || {};
      const durationMs = parseDurationMs(p.duration || '5m');
      conversations.exposure.grantLease({
        toolName: p.toolName,
        granteePeerId: p.grantee,
        conversationId: p.conversationId,
        durationMs,
        maxInvocations: p.maxInvocations,
      });
    } else if (event.type === 'agent:lease:revoke') {
      const p = event.payload || {};
      if (p.leaseId) {
        conversations.exposure.revokeLease(p.leaseId, 'event_revoke');
      } else {
        const matching = conversations.exposure.getActiveLeases(p.grantee).find((l) => l.toolName === p.toolName);
        if (matching) {
          conversations.exposure.revokeLease(matching.leaseId, 'event_revoke');
        }
      }
    }
  });

  const host: CuratorHost = {
    config,
    events,
    prisma,
    processor,
    engine: registeredEngine,
    conversations,

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
