import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpToolRegistry } from './McpToolRegistry.js';
import { buildToolContext } from './context/buildToolContext.js';
import { mcpCorePlugin } from './plugins/mcp-core-plugin.js';
import { mcpOrchestrationPlugin } from './plugins/mcp-orchestration-plugin.js';
import type { McpServerConfig } from './types.js';
import type { CuratorHost } from '@curator/host';

export interface CuratorMcpInstance {
  server: Server;
  registry: McpToolRegistry;
  listen: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createMcpServer(config: McpServerConfig): Promise<CuratorMcpInstance> {
  const {
    name = 'curator-mcp-server',
    version = '1.0.0',
    engine,
    prisma,
    host,
    transport = 'stdio',
    registerBuiltinPlugins = true,
    logger = console,
  } = config;

  // 1. Optionally register core & orchestration plugins into CuratorEngine
  if (registerBuiltinPlugins) {
    const hasCore = engine.plugins.some((p) => p.name === 'mcp-core');
    if (!hasCore) {
      engine.registerPlugin(mcpCorePlugin({ prisma }));
    }

    if (host) {
      const hasOrchestration = engine.plugins.some((p) => p.name === 'mcp-orchestration');
      if (!hasOrchestration) {
        engine.registerPlugin(mcpOrchestrationPlugin({ host, prisma }));
      }
    }
  }

  // 2. Build MCP registry from CuratorEngine with dynamic exposure controller
  const exposureController = config.exposureController || host?.conversations?.exposure;
  const registry = McpToolRegistry.fromEngine(
    engine,
    async () => {
      return buildToolContext({ prisma, host });
    },
    exposureController
  );

  // 3. Initialize MCP Server with tool list change notification capability
  const server = new Server(
    {
      name,
      version,
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    }
  );

  // Broadcast MCP notifications/tools/list_changed when outer exposure changes
  if (exposureController) {
    exposureController.on('exposure_changed', () => {
      registry.refresh();
      try {
        server.notification({
          method: 'notifications/tools/list_changed',
        });
      } catch (_) {
        // Safe catch if client transport not yet connected
      }
    });
  }

  // 4. Attach tool listing with dynamic exposure gating
  server.setRequestHandler(ListToolsRequestSchema, async (_request, extra: any) => {
    const session = extra?.session || config.session;
    return {
      tools: registry.list(session),
    };
  });

  // 5. Attach tool dispatch with lease accounting & trust tier validation
  server.setRequestHandler(CallToolRequestSchema, async (request, extra: any) => {
    const { name: toolName, arguments: args } = request.params;
    const session = extra?.session || config.session;
    const result = await registry.call(toolName, (args as Record<string, unknown>) || {}, session);
    return result as any;
  });

  return {
    server,
    registry,
    async listen(): Promise<void> {
      if (transport === 'stdio') {
        const stdio = new StdioServerTransport();
        await server.connect(stdio);
        logger.info?.(`[CuratorMCP] Server connected on stdio (${registry.list().length} tools exposed)`);
      } else {
        throw new Error(`Transport mode not supported yet: ${JSON.stringify(transport)}`);
      }
    },
    async close(): Promise<void> {
      await server.close();
    },
  };
}

export async function createMcpServerFromHost(
  host: CuratorHost,
  options: Partial<McpServerConfig> = {}
): Promise<CuratorMcpInstance> {
  return createMcpServer({
    name: options.name || `${host.config?.name || 'curator'}-mcp`,
    engine: host.engine,
    prisma: host.prisma,
    host,
    transport: options.transport || 'stdio',
    registerBuiltinPlugins: options.registerBuiltinPlugins ?? true,
    logger: options.logger,
  });
}
