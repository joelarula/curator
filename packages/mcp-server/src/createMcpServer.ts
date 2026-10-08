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

  // 2. Build MCP registry from CuratorEngine
  const registry = McpToolRegistry.fromEngine(engine, async () => {
    return buildToolContext({ prisma, host });
  });

  // 3. Initialize MCP Server
  const server = new Server(
    {
      name,
      version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 4. Attach tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: registry.list(),
    };
  });

  // 5. Attach tool dispatch
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;
    const result = await registry.call(toolName, (args as Record<string, unknown>) || {});
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
