import { defineTool, type CuratorPluginDefinition } from '@curator/agent-server';

export interface McpCorePluginOptions {
  prisma: any;
}

export function mcpCorePlugin(options: McpCorePluginOptions): CuratorPluginDefinition {
  const { prisma } = options;

  const search_knowledge = defineTool({
    name: 'search_knowledge',
    description: 'Search for Resources and Text content in the Curator database',
    mcp: { expose: true },
    accessLevel: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        limit: { type: 'number', description: 'Maximum results to return', default: 10 },
      },
      required: ['query'],
    },
    execute: async (args, ctx) => {
      const db = ctx.prisma || prisma;
      const query = String(args.query || '');
      const limit = Number(args.limit) || 10;

      if (!db?.resource || !db?.text) {
        return { foundResources: [], foundTextSnippets: [] };
      }

      // Search resources
      const resources = await db.resource.findMany({
        where: {
          deletedAt: null,
          OR: [
            { title: { contains: query } },
            { uri: { contains: query } },
          ],
        },
        take: limit,
        select: { id: true, title: true, uri: true },
      });

      // Search texts
      const texts = await db.text.findMany({
        where: {
          deletedAt: null,
          content: { contains: query },
        },
        take: limit,
        include: {
          resource: { select: { title: true } },
        },
      });

      return {
        foundResources: resources,
        foundTextSnippets: texts.map((t: any) => ({
          id: t.id,
          resource: t.resource?.title,
          role: t.role,
          preview: (t.content || '').substring(0, 250) + '...',
        })),
      };
    },
  });

  const read_resource = defineTool({
    name: 'read_resource',
    description: 'Get the full content (texts and metadata) of a specific Resource by numeric ID or URI',
    mcp: { expose: true },
    accessLevel: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Resource numeric ID' },
        uri: { type: 'string', description: 'Resource URI' },
      },
    },
    execute: async (args, ctx) => {
      const db = ctx.prisma || prisma;
      if (!db?.resource) throw new Error('Resource table not available in current database');

      const id = args.id ? Number(args.id) : undefined;
      const uri = args.uri ? String(args.uri) : undefined;

      if (!id && !uri) {
        throw new Error('Either id or uri parameter is required');
      }

      const resource = await db.resource.findFirst({
        where: {
          deletedAt: null,
          OR: [
            id ? { id } : undefined,
            uri ? { uri } : undefined,
          ].filter(Boolean) as any,
        },
        include: {
          texts: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!resource) throw new Error(`Resource not found (id: ${id}, uri: ${uri})`);
      return resource;
    },
  });

  const list_scripts = defineTool({
    name: 'list_scripts',
    description: 'List all available automation scripts in the Curator system',
    mcp: { expose: true },
    accessLevel: 'read_only',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args, ctx) => {
      const db = ctx.prisma || prisma;
      if (!db?.script) return [];
      return db.script.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, ast: true, createdAt: true },
      });
    },
  });

  const get_script = defineTool({
    name: 'get_script',
    description: 'Retrieve the definition and AST of a specific Script by name',
    mcp: { expose: true },
    accessLevel: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Script name' },
      },
      required: ['name'],
    },
    execute: async (args, ctx) => {
      const db = ctx.prisma || prisma;
      if (!db?.script) throw new Error('Script table not available in current database');
      const name = String(args.name || '');
      const script = await db.script.findFirst({
        where: { name, deletedAt: null },
      });
      if (!script) throw new Error(`Script "${name}" not found`);
      return script;
    },
  });

  const execute_script = defineTool({
    name: 'execute_script',
    description: 'Executes a stored script by name or inline pipeline AST',
    mcp: { expose: true },
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        scriptName: { type: 'string', description: 'Name of a stored Script record' },
        args: { type: 'object', description: 'Parameters passed to script context' },
      },
    },
    execute: async (args, ctx) => {
      const db = ctx.prisma || prisma;
      const scriptName = args.scriptName ? String(args.scriptName) : undefined;
      const scriptArgs = (args.args as Record<string, unknown>) || {};

      if (!scriptName) {
        throw new Error('scriptName is required');
      }

      const script = await db.script.findFirst({
        where: { name: scriptName, deletedAt: null },
      });
      if (!script) throw new Error(`Script "${scriptName}" not found`);

      // Create a Request record to execute via RequestProcessor
      const user = await db.user.findFirst({ where: { email: 'system@local' } });
      const project = await db.project.findFirst({ where: { id: '1' } });
      let conversation = await db.conversation.findFirst();
      if (!conversation && user && project) {
        conversation = await db.conversation.create({
          data: { userId: user.id, projectId: project.id },
        });
      }

      const request = await db.request.create({
        data: {
          user: { connect: { id: user?.id || ctx.userId || '1' } },
          project: { connect: { id: project?.id || ctx.projectId || '1' } },
          conversation: { connect: { id: conversation?.id || ctx.conversationId || 1 } },
          script: { connect: { id: script.id } },
          ast: script.ast,
          context: scriptArgs,
          scheduledAt: new Date(),
        },
      });

      return {
        status: 'scheduled',
        requestId: request.id,
        scriptName,
      };
    },
  });

  return {
    name: 'mcp-core',
    description: 'Curator Core Knowledge & Script Execution Tools',
    mcp: { exposeAll: true },
    tools: {
      search_knowledge,
      read_resource,
      list_scripts,
      get_script,
      execute_script,
    },
  };
}
