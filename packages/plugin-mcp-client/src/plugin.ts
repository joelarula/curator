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
      execute: async (args, ctx) => registry.sync(projectOf(ctx), args.name),
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
      tools,
    },
  };
}
