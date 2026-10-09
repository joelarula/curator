import { compileCoffeeScriptToAST } from '@curator/agent-server';
import type { CuratorHost } from '@curator/host';

export function createCuratorResolvers(host: CuratorHost, customResolvers: Record<string, any> = {}) {
  let isPaused = false;

  const baseResolvers = {
    // ----------------------------------------------------
    // Queries
    // ----------------------------------------------------
    metrics: async () => {
      const totalRequests = await host.prisma.request.count();
      const completedRequests = await host.prisma.request.count({ where: { status: 'COMPLETED' } });
      const failedRequests = await host.prisma.request.count({ where: { status: 'FAILED' } });

      return {
        totalRequests,
        completedRequests,
        failedRequests,
        totalAgents: host.engine.agents.size,
        activeAgents: Array.from(host.engine.agents.values()).filter((a: any) => a.enabled).length,
        totalTools: host.engine.tools.size,
        databaseEngine: host.config?.curatorDb?.url ? 'MariaDB/MySQL' : 'SQLite',
      };
    },

    curatorDatabaseHealth: async () => {
      const requestsTotal = await host.prisma.request.count();
      const requestsCompleted = await host.prisma.request.count({ where: { status: 'COMPLETED' } });
      const requestsFailed = await host.prisma.request.count({ where: { status: 'FAILED' } });
      const requestsPending = await host.prisma.request.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } });

      return {
        storageEngine: host.config?.curatorDb?.url ? 'MariaDB/MySQL' : 'SQLite',
        isOpfs: false,
        tables: [
          { name: 'Request', rowCount: requestsTotal },
          { name: 'Response', rowCount: await host.prisma.response.count() },
          { name: 'Agent', rowCount: await host.prisma.agent.count() },
          { name: 'Script', rowCount: await host.prisma.script.count() },
          { name: 'Conversation', rowCount: await host.prisma.conversation.count() },
          { name: 'User', rowCount: await host.prisma.user.count() },
        ],
        requestsTotal,
        requestsCompleted,
        requestsFailed,
        requestsPending,
        agentsTotal: host.engine.agents.size,
        agentsActive: Array.from(host.engine.agents.values()).filter((a: any) => a.enabled).length,
      };
    },

    tools: () => {
      return Array.from(host.engine.tools.entries()).map(([name, tool]: [string, any]) => ({
        name,
        description: tool.description,
        accessLevel: tool.accessLevel || 'domain',
        parameters: tool.parameters || null,
      }));
    },

    tool: ({ name }: { name: string }) => {
      const tool = host.engine.tools.get(name);
      if (!tool) return null;
      return {
        name,
        description: tool.description,
        accessLevel: tool.accessLevel || 'domain',
        parameters: tool.parameters || null,
      };
    },

    agents: () => {
      return Array.from(host.engine.agents.entries()).map(([name, agent]: [string, any]) => ({
        name,
        description: agent.description,
        schedule: agent.schedule || null,
        enabled: agent.enabled ?? true,
      }));
    },

    agent: ({ name }: { name: string }) => {
      const agent = host.engine.agents.get(name);
      if (!agent) return null;
      return {
        name,
        description: agent.description,
        schedule: agent.schedule || null,
        enabled: agent.enabled ?? true,
      };
    },

    curatorAgents: async () => {
      const dbAgents = await host.prisma.agent.findMany();
      return Array.from(host.engine.agents.entries()).map(([name, agent]: [string, any], idx) => {
        const dbMatch = dbAgents.find((a: any) => a.name === name);
        return {
          id: dbMatch?.id || `agent_${idx + 1}`,
          name,
          schedule: agent.schedule || null,
          isActive: agent.enabled ?? true,
          enabled: agent.enabled ?? true,
          lastRunAt: dbMatch?.updatedAt?.toISOString() || null,
        };
      });
    },

    curatorRequests: async ({ limit = 50, status }: { limit?: number; status?: string }) => {
      const where: any = {};
      if (status) where.status = status;

      const requests = await host.prisma.request.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { responses: true },
      });

      return requests.map((r: any) => ({
        id: r.id,
        scriptId: r.scriptId,
        parentId: r.parentId,
        notifyId: r.notifyId,
        toolName: r.toolName,
        agentName: r.agentName || 'system',
        status: r.status,
        retryCount: r.retryCount || 0,
        ast: r.ast,
        context: r.context,
        scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
        createdAt: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
        responses: (r.responses || []).map((resp: any) => ({
          id: resp.id,
          requestId: resp.requestId,
          content: typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content),
          createdAt: resp.createdAt ? resp.createdAt.toISOString() : new Date().toISOString(),
        })),
      }));
    },

    curatorRequest: async ({ id }: { id: string }) => {
      const r = await host.prisma.request.findUnique({
        where: { id },
        include: { responses: true },
      });
      if (!r) return null;
      return {
        id: r.id,
        scriptId: r.scriptId,
        parentId: r.parentId,
        notifyId: r.notifyId,
        toolName: r.toolName,
        agentName: r.agentName || 'system',
        status: r.status,
        retryCount: r.retryCount || 0,
        ast: r.ast,
        context: r.context,
        scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
        createdAt: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
        responses: (r.responses || []).map((resp: any) => ({
          id: resp.id,
          requestId: resp.requestId,
          content: typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content),
          createdAt: resp.createdAt ? resp.createdAt.toISOString() : new Date().toISOString(),
        })),
      };
    },

    conversations: async ({ limit = 20 }: { limit?: number }) => {
      const convs = await host.prisma.conversation.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { responses: { take: 10, orderBy: { createdAt: 'desc' } } },
      });

      return convs.map((c: any) => ({
        id: c.id,
        externalId: c.externalId,
        userId: c.userId,
        metadata: c.metadata,
        createdAt: c.createdAt ? c.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
        responses: (c.responses || []).map((resp: any) => ({
          id: resp.id,
          requestId: resp.requestId,
          content: typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content),
          createdAt: resp.createdAt ? resp.createdAt.toISOString() : new Date().toISOString(),
        })),
      }));
    },

    conversation: async ({ id }: { id: string }) => {
      const c = await host.prisma.conversation.findUnique({
        where: { id },
        include: { responses: { orderBy: { createdAt: 'asc' } } },
      });
      if (!c) return null;
      return {
        id: c.id,
        externalId: c.externalId,
        userId: c.userId,
        metadata: c.metadata,
        createdAt: c.createdAt ? c.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
        responses: (c.responses || []).map((resp: any) => ({
          id: resp.id,
          requestId: resp.requestId,
          content: typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content),
          createdAt: resp.createdAt ? resp.createdAt.toISOString() : new Date().toISOString(),
        })),
      };
    },

    events: ({ limit = 50 }: { limit?: number }) => {
      const logs = host.events.getRecentLogs() || [];
      return logs.slice(0, limit).map((l: any) => ({
        type: l.type || 'log',
        payload: l.payload || l,
        timestamp: l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString(),
        sender: l.sender || 'host',
      }));
    },

    peers: () => {
      return [
        { id: 'alpha', name: 'Host Alpha', status: 'online', eventsUrl: 'ws://127.0.0.1:4101/api/mesh/events' },
        { id: 'beta', name: 'Host Beta', status: 'online', eventsUrl: 'ws://127.0.0.1:4102/api/mesh/events' },
      ];
    },

    // ----------------------------------------------------
    // Mutations
    // ----------------------------------------------------
    executeTool: async ({ name, args }: { name: string; args?: any }) => {
      try {
        const tool = host.engine.tools.get(name);
        if (!tool) {
          return { success: false, tool: name, result: null, error: `Tool '${name}' not found` };
        }
        const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args || {};
        const result = await tool.execute(parsedArgs, { prisma: host.prisma, events: host.events });
        return { success: true, tool: name, result, error: null };
      } catch (err: any) {
        return { success: false, tool: name, result: null, error: err.message };
      }
    },

    triggerAgent: async ({ name, context }: { name: string; context?: any }) => {
      try {
        const parsedContext = typeof context === 'string' ? JSON.parse(context) : context || {};
        const req = await host.triggerAgent(name, parsedContext);
        return { success: true, requestId: req.id, agent: name, status: req.status, error: null };
      } catch (err: any) {
        return { success: false, requestId: '', agent: name, status: 'FAILED', error: err.message };
      }
    },

    sendMessage: async ({ conversationId, content }: { conversationId?: string; content: string }) => {
      try {
        const convExternalId = conversationId || 'conv_default';
        const user = await host.prisma.user.findFirst();
        const conv = await host.prisma.conversation.upsert({
          where: { externalId: convExternalId },
          update: { updatedAt: new Date() },
          create: {
            externalId: convExternalId,
            userId: user?.id || '1',
            projectId: '1',
            metadata: { startedAt: new Date().toISOString() },
          },
        });

        let req: any = null;
        try {
          req = await host.triggerAgent('dialog_playground', {
            conversationId: conv.id,
            userInput: content,
          });
        } catch {
          // agent may not exist in all hosts, proceed with recording response
        }

        const resp = await host.prisma.response.create({
          data: {
            conversationId: conv.id,
            requestId: req?.id || null,
            projectId: '1',
            content: `User: ${content}`,
          },
        });

        return {
          success: true,
          conversationId: conv.id,
          responseId: resp.id,
          reply: req ? `Task #${req.id} enqueued for processing.` : 'Message received.',
          error: null,
        };
      } catch (err: any) {
        return { success: false, conversationId: '', responseId: null, reply: null, error: err.message };
      }
    },

    compileCoffeeScript: async ({ code }: { code: string }) => {
      try {
        const ast = await compileCoffeeScriptToAST(code);
        return { success: true, ast, error: null };
      } catch (err: any) {
        return { success: false, ast: null, error: err.message };
      }
    },

    broadcastEvent: ({ type, payload }: { type: string; payload?: any }) => {
      try {
        const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload || {};
        host.events.broadcast(type, parsed);
        return true;
      } catch (_) {
        return false;
      }
    },

    toggleCuratorAgent: ({ id, isActive }: { id: string; isActive: boolean }) => {
      const agent = Array.from(host.engine.agents.values())[0] as any;
      if (agent) agent.enabled = isActive;
      return {
        id,
        name: agent?.name || 'agent',
        schedule: agent?.schedule || null,
        isActive,
        enabled: isActive,
        lastRunAt: new Date().toISOString(),
      };
    },

    updateAgentSchedule: ({ id, schedule }: { id: string; schedule: string }) => {
      return {
        id,
        name: 'agent',
        schedule,
        isActive: true,
        enabled: true,
        lastRunAt: new Date().toISOString(),
      };
    },

    toggleEnginePause: async () => {
      isPaused = !isPaused;
      if (isPaused) {
        await host.stop();
      } else {
        await host.start(1000);
      }
      return isPaused;
    },
  };

  return {
    ...baseResolvers,
    ...customResolvers,
  };
}
