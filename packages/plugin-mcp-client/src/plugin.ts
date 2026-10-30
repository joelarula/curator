import { defineTool, type CuratorPluginDefinition } from '@curator/agent-server';
import { McpRemoteRegistry, type McpRegistryOptions } from './McpRemoteRegistry.js';

const projectOf = (ctx: any): string => {
  if (ctx?.projectId === undefined || ctx?.projectId === null || ctx?.projectId === '') {
    throw new Error('No active project for MCP server management');
  }
  return String(ctx.projectId);
};

const str = (description: string) => ({ type: 'string', description });

/**
 * Role allowed to (re)connect and sync registered servers. A default user role, so connector flows run as
 * the host user in its project; registering or removing servers stays separate.
 */
export const MCP_CONNECTOR_ROLE = 'mcp_connector';
/** Script running one connection workflow per server (`context.server`); see `connectorWorkflow`. */
export const MCP_CONNECT_SCRIPT = 'mcp_connect';

/** Per-server event names: `mcp:<server>:retry` (try now) and `mcp:<server>:disconnected` (connection lost). */
export const mcpServerEvent = (server: string, kind: 'retry' | 'disconnected') => `mcp:${server}:${kind}`;
const serverEvent = (kind: 'retry' | 'disconnected') => `{{ 'mcp:' + $context.server + ':${kind}' }}`;

/**
 * Keeps one server connected, as a state machine of Requests:
 * sync → connected (waits for `disconnected`) | login (waits for `auth:login`) | backoff (waits
 * `retryInSeconds`) → sync again; a server that is no longer registered ends the flow.
 * `mcp:<server>:retry` cuts any wait short.
 */
export const connectorWorkflow = {
  type: 'Curator_Graph',
  name: 'mcp_connect',
  startNode: 'sync',
  nodes: {
    sync: { type: 'Curator_Tool', toolName: 'mcp_server_connect', args: { name: '$context.server' }, as: 'mcpConnect', spread: false },
    connected: { type: 'Curator_WaitEvent', eventName: serverEvent('disconnected'), eventNames: [serverEvent('retry')] },
    login: { type: 'Curator_WaitEvent', eventName: 'auth:login', eventNames: [serverEvent('retry')] },
    backoff: { type: 'Curator_WaitEvent', eventName: serverEvent('retry'), timeoutSeconds: '$context.mcpConnect.retryInSeconds' },
  },
  edges: {
    sync: [
      { to: 'connected', when: "$context.mcpConnect.status == 'connected'" },
      { to: 'login', when: "$context.mcpConnect.status == 'auth_required'" },
      { to: '__end__', when: "$context.mcpConnect.status == 'gone'" },
      { to: 'backoff' },
    ],
    connected: 'sync',
    login: 'sync',
    backoff: 'sync',
  },
};

/**
 * Local tools for managing and using remote MCP providers. Projects always come from the
 * request (session / x-project-id), never from tool arguments.
 */
export function createMcpClientPlugin(options: McpRegistryOptions = {}): { plugin: CuratorPluginDefinition; registry: McpRemoteRegistry } {
  const registry = new McpRemoteRegistry(options);

  const tools = [
    defineTool({
      name: 'mcp_servers_list',
      description: 'List remote MCP servers available to this project (own and shared) with status and tool aliases',
      parameters: { type: 'object', properties: {} },
      accessLevel: 'read_only',
      execute: async (_args, ctx) => registry.list(ctx.projectId as any),
    }),
    defineTool<{ name: string; url: string; authService?: string }>({
      name: 'mcp_server_register',
      description: 'Register (or update) a remote MCP server in this project and sync its tools, resources and prompts',
      parameters: {
        type: 'object',
        properties: {
          name: str('Server name, used in tool aliases mcp.<name>.<tool>'),
          url: str('Streamable HTTP endpoint (https, or http on localhost)'),
          authService: str('Auth service (auth.json) supplying tokens; omit for unauthenticated servers'),
        },
        required: ['name', 'url'],
      },
      // Adding a remote provider extends what workflows can reach: approval-gated.
      accessLevel: 'elevated',
      execute: async (args, ctx) =>
        registry.register({
          projectId: projectOf(ctx),
          name: args.name,
          url: args.url,
          authService: args.authService,
          createdBy: ctx.userId !== undefined ? String(ctx.userId) : undefined,
        }),
    }),
    defineTool<{ name: string }>({
      name: 'mcp_server_sync',
      description: "Re-sync a remote MCP server's tools, resources and prompts into the catalog",
      parameters: { type: 'object', properties: { name: str('Server name') }, required: ['name'] },
      accessLevel: 'safe_write',
      requiredRole: MCP_CONNECTOR_ROLE,
      execute: async (args, ctx) => registry.sync(projectOf(ctx), args.name),
    }),
    defineTool<{ name: string }>({
      name: 'mcp_server_connect',
      description: 'Try to connect and sync a registered MCP server; reports connected / auth_required / error (with retryInSeconds) / gone',
      parameters: { type: 'object', properties: { name: str('Server name') }, required: ['name'] },
      accessLevel: 'safe_write',
      requiredRole: MCP_CONNECTOR_ROLE,
      execute: async (args, ctx) => {
        const result = await registry.tryConnect(projectOf(ctx), args.name);
        // Broadcast for UIs (REPL, web) as `mcp:status`.
        return { ...result, event: { name: 'mcp:status', payload: result } };
      },
    }),
    defineTool<{ name: string }>({
      name: 'mcp_server_unregister',
      description: 'Remove a remote MCP server from this project (its tools stop resolving)',
      parameters: { type: 'object', properties: { name: str('Server name') }, required: ['name'] },
      accessLevel: 'destructive',
      execute: async (args, ctx) => {
        await registry.unregister(projectOf(ctx), args.name);
        return { ok: true, name: args.name };
      },
    }),
    defineTool<{ server?: string }>({
      name: 'mcp_resources_list',
      description: 'List cataloged resources and URI templates of remote MCP servers (from the database)',
      parameters: { type: 'object', properties: { server: str('Limit to one server') } },
      accessLevel: 'read_only',
      execute: async (args, ctx) => registry.listResources(ctx.projectId as any, args.server),
    }),
    defineTool<{ server: string; uri: string }>({
      name: 'mcp_resource_read',
      description: 'Read a resource from a remote MCP server',
      parameters: {
        type: 'object',
        properties: { server: str('Server name'), uri: str('Resource URI (a concrete URI for templates)') },
        required: ['server', 'uri'],
      },
      accessLevel: 'read_only',
      execute: async (args, ctx) => registry.readResource(ctx.projectId as any, args.server, args.uri),
    }),
    defineTool<{ server?: string }>({
      name: 'mcp_prompts_list',
      description: 'List cataloged prompts of remote MCP servers (from the database)',
      parameters: { type: 'object', properties: { server: str('Limit to one server') } },
      accessLevel: 'read_only',
      execute: async (args, ctx) => registry.listPrompts(ctx.projectId as any, args.server),
    }),
    defineTool<{ server: string; name: string; arguments?: Record<string, string> }>({
      name: 'mcp_prompt_get',
      description: 'Render a prompt from a remote MCP server with arguments',
      parameters: {
        type: 'object',
        properties: {
          server: str('Server name'),
          name: str('Prompt name'),
          arguments: { type: 'object', additionalProperties: { type: 'string' }, description: 'Prompt arguments' },
        },
        required: ['server', 'name'],
      },
      accessLevel: 'read_only',
      execute: async (args, ctx) => registry.getPrompt(ctx.projectId as any, args.server, args.name, args.arguments),
    }),
  ];

  return {
    registry,
    plugin: {
      name: 'mcp-client',
      version: '1.0.0',
      description: 'Remote MCP providers: registration, catalog and project-scoped remote tools',
      roles: [{ name: MCP_CONNECTOR_ROLE, description: 'Connects and re-syncs registered remote MCP servers' }] as any,
      defaultUserRoles: [MCP_CONNECTOR_ROLE],
      scripts: { [MCP_CONNECT_SCRIPT]: { body: '// Keeps one remote MCP server connected (context.server)', ast: connectorWorkflow } } as any,
      tools,
    },
  };
}
