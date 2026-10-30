import http from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpToolRegistry, createHostToolExecutor } from './McpToolRegistry.js';
import { mcpCorePlugin } from './plugins/mcp-core-plugin.js';
import { mcpOrchestrationPlugin } from './plugins/mcp-orchestration-plugin.js';
import { createMcpHttpHandler, type McpHttpHandler } from './httpTransport.js';
import type { McpCallSession, McpServerConfig } from './types.js';
import type { CuratorHost } from '@curator/host';

export interface CuratorMcpInstance {
  /** The stdio server (HTTP builds one Server per request, bound to the caller's session). */
  server: Server;
  registry: McpToolRegistry;
  /** Builds an MCP Server whose calls run with `session` (actor + exposure peer). */
  createServer(session?: McpCallSession): Server;
  /** Streamable HTTP handler for mounting in an existing server (Express/node http). */
  httpHandler(options?: { path?: string; publicUrl?: string }): McpHttpHandler;
  /** Bound host/port of the HTTP transport after `listen()` (null for stdio or before listening). */
  address(): { host: string; port: number } | null;
  listen: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createMcpServer(config: McpServerConfig): Promise<CuratorMcpInstance> {
  const {
    name = 'curator-mcp-server',
    version = '1.0.0',
    host,
    transport = 'stdio',
    registerBuiltinPlugins = true,
    logger = console,
  } = config;
  const engine = config.engine ?? host?.engine;
  const prisma = config.prisma ?? host?.prisma;
  if (!engine) {
    throw new Error('createMcpServer requires a Curator host (or an engine with an executor).');
  }
  // MCP never runs tool functions directly: every call is a Request in the durable database.
  const execute = config.execute ?? (host ? createHostToolExecutor(host) : undefined);
  if (!execute) {
    throw new Error('createMcpServer requires a durable executor: pass `host` or `execute`.');
  }

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

  // 2. Build MCP registry (listing from the engine, execution as Requests) with dynamic exposure controller
  const exposureController = config.exposureController || host?.conversations?.exposure;
  const registry = McpToolRegistry.fromEngine(engine, execute, exposureController);

  // 3. MCP Servers: tool listing with dynamic exposure gating, dispatch with lease accounting and
  //    trust tier validation. `session` comes from the transport (authenticated HTTP caller) or config.
  const servers = new Set<Server>();
  const createServer = (session?: McpCallSession): Server => {
    const server = new Server(
      { name, version },
      { capabilities: { tools: { listChanged: true } } }
    );
    server.setRequestHandler(ListToolsRequestSchema, async (_request, extra: any) => ({
      tools: registry.list(session ?? extra?.session ?? config.session),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra: any) => {
      const { name: toolName, arguments: args } = request.params;
      const result = await registry.call(toolName, (args as Record<string, unknown>) || {}, session ?? extra?.session ?? config.session);
      return result as any;
    });
    servers.add(server);
    server.onclose = () => servers.delete(server);
    return server;
  };
  const server = createServer();

  // Broadcast MCP notifications/tools/list_changed when outer exposure changes
  if (exposureController) {
    exposureController.on('exposure_changed', () => {
      registry.refresh();
      for (const s of servers) {
        try {
          s.notification({ method: 'notifications/tools/list_changed' });
        } catch (_) {
          // Safe catch if client transport not yet connected
        }
      }
    });
  }

  const httpConfig = typeof transport === 'object' ? transport.http : undefined;
  const httpHandler = (options: { path?: string; publicUrl?: string } = {}) =>
    createMcpHttpHandler({
      createServer,
      path: options.path ?? httpConfig?.path,
      publicUrl: options.publicUrl ?? httpConfig?.publicUrl,
      auth: config.auth,
      allowAnonymous: config.allowAnonymousHttp,
      anonymousSession: config.session,
      logger,
    });
  let httpServer: http.Server | undefined;

  return {
    server,
    registry,
    createServer,
    httpHandler,
    address() {
      const addr = httpServer?.address();
      return addr && typeof addr === 'object' ? { host: httpConfig?.host ?? '127.0.0.1', port: addr.port } : null;
    },
    async listen(): Promise<void> {
      if (transport === 'stdio') {
        const stdio = new StdioServerTransport();
        await server.connect(stdio);
        logger.info?.(`[CuratorMCP] Server connected on stdio (${registry.list().length} tools exposed)`);
        return;
      }
      if (!httpConfig) throw new Error(`Unsupported transport: ${JSON.stringify(transport)}`);
      const handle = httpHandler();
      httpServer = http.createServer((req, res) => {
        handle(req, res).then(
          (handled) => {
            if (!handled) res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"not_found"}');
          },
          (err) => {
            logger.error?.(`[CuratorMCP] ${err?.message || err}`);
            if (!res.headersSent) res.writeHead(500).end();
          }
        );
      });
      await new Promise<void>((resolve, reject) => {
        httpServer!.once('error', reject);
        httpServer!.listen(httpConfig.port, httpConfig.host ?? '127.0.0.1', () => resolve());
      });
      const address = httpServer.address();
      const port = typeof address === 'object' && address ? address.port : httpConfig.port;
      logger.info?.(`[CuratorMCP] Streamable HTTP on http://${httpConfig.host ?? '127.0.0.1'}:${port}${httpConfig.path ?? '/mcp'} (${registry.list().length} tools exposed)`);
    },
    async close(): Promise<void> {
      if (httpServer) {
        httpServer.closeAllConnections();
        await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
        httpServer = undefined;
      }
      await Promise.all([...servers].map((s) => s.close().catch(() => undefined)));
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
    exposureController: options.exposureController,
    session: options.session,
    logger: options.logger,
    auth: options.auth,
    allowAnonymousHttp: options.allowAnonymousHttp,
  });
}
