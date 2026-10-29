import path from 'node:path';
import {
  provisionSqliteDb,
  provisionMariadbDb,
  CuratorRequestProcessor,
  curatorEngine,
  ConversationManager,
  ConversationRouter,
  createConversationPlugin,
  registerStateProjector,
  setLogLevel,
} from '@curator/agent-server';
import { CuratorHostEvents } from './events/CuratorHostEvents.js';
import { seedAgentsAndTools } from './seed/seedAgentsAndTools.js';
import { resolveHostPolicy } from './hostPolicy.js';
import { CuratorHostService } from './hostService.js';
import type { CuratorHost, CuratorHostConfig, SeedResult, HostRunToolOptions, HostEmitEventOptions } from './types.js';

export async function createCuratorHost(config: CuratorHostConfig): Promise<CuratorHost> {
  if (config.logLevel) {
    setLogLevel(config.logLevel);
  }
  const name = config.name || 'curator';
  const dataDir = config.dataDir ?? process.env.DATA_DIR ?? './data';
  const logger = config.logger ?? console;
  const policy = resolveHostPolicy(config);

  // 1. Resolve database connection / path
  const curatorDbUrl = config.curatorDb?.url ?? process.env.CURATOR_DATABASE_URL ?? process.env.DATABASE_URL;
  let prisma: any;
  let databasePath: string | undefined;

  if (curatorDbUrl && (curatorDbUrl.startsWith('mysql://') || curatorDbUrl.startsWith('mariadb://'))) {
    prisma = await provisionMariadbDb(curatorDbUrl);
  } else {
    const forceReset = Boolean(config.forceReset ?? config.curatorDb?.forceReset);
    databasePath = config.curatorDb?.path ?? process.env.CURATOR_DATABASE_PATH ?? path.join(dataDir, 'state', 'curator.db');
    prisma = await provisionSqliteDb(name, forceReset, { databasePath });
    try {
      await prisma.$executeRawUnsafe?.('PRAGMA synchronous = OFF;');
    } catch (_) {}
  }

  // 2. Ensure system user, project and conversation scoping exist idempotently
  const userEmail = config.userEmail || 'system@local';
  const userName = config.userName || 'System User';
  const userId = config.userId || 'system';
  const projectName = config.projectName || name;
  const projectId = config.projectId || '1';

  let user = await prisma.user.findFirst({
    where: { OR: [{ email: userEmail }, { id: userId }, { id: 'system' }] },
  });
  if (!user) {
    user = await prisma.user.create({
      data: { id: userId, name: userName, email: userEmail },
    });
  }

  let project = await prisma.project.findFirst({
    where: { OR: [{ id: projectId }, { name: projectName }] },
  });
  if (!project) {
    project = await prisma.project.create({
      data: { id: projectId, name: projectName, userId: user.id },
    });
  }

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
  // `host` is attached after construction (the processor keeps this object by reference).
  const toolContextExtras: Record<string, any> = config.domainDb ? { domainDb: config.domainDb } : {};
  const processor = new (CuratorRequestProcessor as any)(prisma, {
    astStorage: policy.astStorage,
    retention: policy.retention,
    approvalTtlMs: config.approvalTtlMs,
    engine: registeredEngine,
    toolContextExtras,
    onEvent: (type: string, payload: any) => {
      events.broadcast(type, payload);
      if (type === 'request_done') {
        events.broadcast('database_change', {
          tables: ['requests', 'responses', 'agents'],
        });
      }
    },
  });

  // Plugin projectors run for every state event on this database, whichever component appends it
  const unregisterProjectors = registeredEngine.plugins.flatMap((plugin: any) =>
    (plugin.stateProjectors ?? []).map((projector: any) => registerStateProjector(prisma, projector))
  );

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

  if (typeof registeredEngine.registerPlugin === 'function') {
    registeredEngine.registerPlugin(createConversationPlugin(conversations));
  }

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
    policy,
    config,
    events,
    prisma,
    processor,
    engine: registeredEngine,
    conversations,
    user,
    project,

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
      unregisterProjectors.forEach((unregister: () => void) => unregister());
      if (prisma && typeof prisma.$disconnect === 'function') {
        await prisma.$disconnect();
      }
      logger.info?.(`[CuratorHost:${name}] Host stopped cleanly`);
    },

    async gracefulShutdown(): Promise<void> {
      await host.stop();
    },

    async runTool(toolName: string, args: Record<string, any> = {}, opts: HostRunToolOptions = {}) {
      return processor.runToolRequest({
        toolName,
        args,
        runtimeArgs: opts.runtimeArgs,
        runtimeContext: opts.runtimeContext,
        conversationId: opts.conversationId ?? conversation.id,
        userId: opts.userId ?? user.id,
        projectId: opts.projectId ?? project.id,
        agentId: opts.agentId,
        origin: opts.origin ?? 'API',
        context: opts.context,
        broadcastToolEvents: opts.broadcastToolEvents,
      });
    },

    async emitEvent(eventName: string, payload?: any, opts: HostEmitEventOptions = {}) {
      return processor.emitEventRequest({
        ...opts,
        eventName,
        payload,
        conversationId: opts.conversationId ?? conversation.id,
        userId: opts.userId ?? user.id,
        projectId: opts.projectId ?? project.id,
        origin: opts.origin ?? 'API',
      });
    },

    async seed(): Promise<SeedResult> {
      const result = await seedAgentsAndTools(prisma, registeredEngine, {
        projectName,
        projectId,
        userId,
        userName,
        userEmail,
        logger,
        rbacManagers: config.rbac?.managers,
        definitions: policy.definitions,
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

    async createProject(options: {
      id?: string;
      name: string;
      userId?: string;
      description?: string;
      roles?: string[];
      assignDefaultRolesToUser?: boolean;
    }): Promise<{ project: any; conversation: any; projectRoles: string[] }> {
      const pId = options.id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const pUserId = options.userId || user.id;

      let newProject = await prisma.project.findFirst({
        where: { id: pId },
      });
      if (!newProject) {
        newProject = await prisma.project.create({
          data: {
            id: pId,
            name: options.name,
            userId: pUserId,
          },
        });
      }

      let newConversation = await prisma.conversation.findFirst({
        where: { projectId: newProject.id, userId: pUserId },
      });
      if (!newConversation) {
        newConversation = await prisma.conversation.create({
          data: {
            projectId: newProject.id,
            userId: pUserId,
          },
        });
      }

      // Assign ProjectRole records (project can have 0 - n roles)
      const projectRoles: string[] = [];
      const rolesToAssign = options.roles ?? (
        registeredEngine.roles ? Array.from(registeredEngine.roles.keys()) : []
      );

      if (prisma.projectRole) {
        for (const roleName of rolesToAssign) {
          const roleRec = await prisma.role.findFirst({
            where: { OR: [{ id: roleName }, { name: roleName }] },
          });
          if (roleRec) {
            const existing = await prisma.projectRole.findFirst({
              where: { projectId: newProject.id, roleId: roleRec.id },
            });
            if (!existing) {
              await prisma.projectRole.create({
                data: { projectId: newProject.id, roleId: roleRec.id },
              });
            }
            projectRoles.push(roleName);
          }
        }
      }

      // Optionally assign default user roles to the project creator / human user
      if (options.assignDefaultRolesToUser !== false && prisma.userRole) {
        const defaultRoles: string[] = [];
        if (registeredEngine?.plugins) {
          for (const plugin of registeredEngine.plugins) {
            if (plugin?.defaultUserRoles && Array.isArray(plugin.defaultUserRoles)) {
              for (const r of plugin.defaultUserRoles) defaultRoles.push(r);
            }
          }
        }
        for (const roleName of defaultRoles) {
          const roleRec = await prisma.role.findFirst({ where: { OR: [{ id: roleName }, { name: roleName }] } });
          if (roleRec) {
            const existingUr = await prisma.userRole.findFirst({
              where: { userId: pUserId, roleId: roleRec.id, projectId: newProject.id },
            });
            if (!existingUr) {
              await prisma.userRole.create({
                data: { userId: pUserId, roleId: roleRec.id, projectId: newProject.id },
              });
            }
          }
        }
      }

      events.broadcast('project_created', { projectId: newProject.id, name: newProject.name });
      return { project: newProject, conversation: newConversation, projectRoles };
    },

    async listProjects(): Promise<any[]> {
      const projects = await prisma.project.findMany({
        where: { existent: true },
        include: {
          projectRoles: { include: { role: true } },
          roles: true,
          conversations: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      return projects.map((p: any) => ({
        ...p,
        roles: (p.projectRoles && p.projectRoles.length > 0)
          ? p.projectRoles.map((pr: any) => pr.role).filter(Boolean)
          : (p.roles || []),
      }));
    },

    async getProject(projectId: string): Promise<any | null> {
      const p = await prisma.project.findFirst({
        where: { id: projectId, existent: true },
        include: {
          projectRoles: { include: { role: true } },
          roles: true,
          conversations: true,
          agents: true,
        },
      });
      if (!p) return null;
      return {
        ...p,
        roles: (p.projectRoles && p.projectRoles.length > 0)
          ? p.projectRoles.map((pr: any) => pr.role).filter(Boolean)
          : (p.roles || []),
      };
    },

    async assignUserProjectRole(userId: string, roleName: string, projectId: string): Promise<any> {
      const roleRec = await prisma.role.findFirst({
        where: { OR: [{ id: roleName }, { name: roleName }] },
      });
      if (!roleRec) {
        throw new Error(`Role '${roleName}' not found.`);
      }
      // Ensure role is assigned to the project as a ProjectRole
      if (prisma.projectRole) {
        const pr = await prisma.projectRole.findFirst({
          where: { projectId, roleId: roleRec.id },
        });
        if (!pr) {
          await prisma.projectRole.create({
            data: { projectId, roleId: roleRec.id },
          });
        }
      }
      // Ensure userRole with projectId exists
      const existing = await prisma.userRole.findFirst({
        where: { userId, roleId: roleRec.id, projectId },
      });
      if (existing) return existing;
      return prisma.userRole.create({
        data: { userId, roleId: roleRec.id, projectId },
      });
    },

    async getUserProjectRoles(userId: string, projectId: string): Promise<string[]> {
      const userRoles = await prisma.userRole.findMany({
        where: {
          userId,
          OR: [{ projectId }, { projectId: null }],
        },
        include: { role: true },
      });
      return userRoles.map((ur: any) => ur.role?.name).filter(Boolean);
    },
  };
  processor.provideService(CuratorHostService, host);
  /** @deprecated Read the host with `ctx.service(CuratorHostService)`; kept for tools that read `ctx.host`. */
  toolContextExtras.host = host;

  // 7. Seed tools, scripts, and agents if not already in database (idempotent setup)
  if (config.autoSeed !== false) {
    await host.seed();
  }

  return host;
}
