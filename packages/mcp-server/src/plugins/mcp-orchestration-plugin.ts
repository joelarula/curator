import { defineTool, type CuratorPluginDefinition } from '@curator/agent-server';
import type { CuratorHost } from '@curator/host';

export interface McpOrchestrationPluginOptions {
  host?: CuratorHost;
  prisma?: any;
}

export function mcpOrchestrationPlugin(options: McpOrchestrationPluginOptions): CuratorPluginDefinition {
  const { host, prisma } = options;

  const trigger_agent = defineTool({
    name: 'trigger_agent',
    description: 'Trigger a background Curator agent workflow with custom input context',
    mcp: { expose: true },
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the agent or workflow to run' },
        context: { type: 'object', description: 'Input variables passed to the agent workflow' },
      },
      required: ['name'],
    },
    execute: async (args, ctx) => {
      const activeHost = (ctx.host as CuratorHost) || host;
      if (!activeHost) {
        throw new Error('CuratorHost instance is required to trigger agents');
      }

      const agentName = String(args.name || '');
      const inputContext = (args.context as Record<string, any>) || {};

      const request = await activeHost.triggerAgent(agentName, inputContext);
      return {
        success: true,
        requestId: request.id,
        agent: agentName,
        status: request.status,
      };
    },
  });

  const get_request = defineTool({
    name: 'get_request',
    description: 'Retrieve status, execution context, and generated responses for a specific Curator Request',
    mcp: { expose: true },
    accessLevel: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        requestId: { type: 'number', description: 'Numeric ID of the request' },
      },
      required: ['requestId'],
    },
    execute: async (args, ctx) => {
      const db = ctx.prisma || prisma || host?.prisma;
      if (!db?.request) throw new Error('Request table not available in current database');

      const requestId = Number(args.requestId);
      const req = await db.request.findUnique({
        where: { id: requestId },
        include: {
          responses: {
            where: { existent: true },
            orderBy: { createdAt: 'desc' },
          },
          script: { select: { id: true, name: true } },
          agent: { select: { id: true, name: true } },
        },
      });

      if (!req) throw new Error(`Request #${requestId} not found`);
      return req;
    },
  });

  const list_requests = defineTool({
    name: 'list_requests',
    description: 'List recent Curator request execution runs with optional filtering',
    mcp: { expose: true },
    accessLevel: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status (NEW, WAITING, COMPLETED, FAILED, PAUSED)' },
        agentId: { type: 'string', description: 'Filter by agent ID or name' },
        limit: { type: 'number', description: 'Maximum items to retrieve', default: 20 },
      },
    },
    execute: async (args, ctx) => {
      const db = ctx.prisma || prisma || host?.prisma;
      if (!db?.request) return [];

      const limit = Number(args.limit) || 20;
      const status = args.status ? String(args.status) : undefined;
      const agentId = args.agentId ? String(args.agentId) : undefined;

      return db.request.findMany({
        where: {
          deletedAt: null,
          ...(status ? { status } : {}),
          ...(agentId ? { OR: [{ agentId }, { script: { name: agentId } }] } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          status: true,
          agentId: true,
          scheduledAt: true,
          createdAt: true,
          script: { select: { name: true } },
        },
      });
    },
  });

  const pause_request = defineTool({
    name: 'pause_request',
    description: 'Pause a pending or running Curator request',
    mcp: { expose: true },
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        requestId: { type: 'number', description: 'Request ID to pause' },
      },
      required: ['requestId'],
    },
    execute: async (args, ctx) => {
      const activeHost = (ctx.host as CuratorHost) || host;
      if (!activeHost) throw new Error('CuratorHost instance is required to pause requests');
      const requestId = Number(args.requestId);
      const paused = await activeHost.pauseRequest(requestId);
      return { success: true, requestId, status: paused.status };
    },
  });

  const resume_request = defineTool({
    name: 'resume_request',
    description: 'Resume a paused Curator request',
    mcp: { expose: true },
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        requestId: { type: 'number', description: 'Request ID to resume' },
      },
      required: ['requestId'],
    },
    execute: async (args, ctx) => {
      const activeHost = (ctx.host as CuratorHost) || host;
      if (!activeHost) throw new Error('CuratorHost instance is required to resume requests');
      const requestId = Number(args.requestId);
      const resumed = await activeHost.resumeRequest(requestId);
      return { success: true, requestId, status: resumed.status };
    },
  });

  return {
    name: 'mcp-orchestration',
    description: 'Curator Agent Workflow Orchestration & Control Tools',
    mcp: { exposeAll: true },
    tools: {
      trigger_agent,
      get_request,
      list_requests,
      pause_request,
      resume_request,
    },
  };
}
