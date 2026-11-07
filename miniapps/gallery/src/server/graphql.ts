import { buildSchema, graphql, type GraphQLSchema } from 'graphql';
import { compileCoffeeScriptToAST } from '@curator/agent-server';
import { wrapResolversWithAuth } from '@curator/plugin-auth';
import { galleryTypeDefs } from './schema.ts';
import { authEngine } from './auth.ts';
import type { GalleryHost } from '../host.ts';

export const schema: GraphQLSchema = buildSchema(galleryTypeDefs);

const runtimeDbs = (runtime: any): any[] => [
  ...new Set([runtime?.prisma, runtime?.durablePrisma].filter(Boolean)),
];

const definitionsOf = (runtime: any): any => runtime?.definitionsPrisma ?? runtime?.prisma;

const sumCounts = async (runtime: any, count: (db: any) => Promise<number>): Promise<number> =>
  (await Promise.all(runtimeDbs(runtime).map(count))).reduce((a, b) => a + b, 0);

const requestsOf = (runtime: any) => ({
  count: (args?: any) => sumCounts(runtime, (db) => db.request.count(args)),
  updateMany: async (args: any) => ({
    count: await sumCounts(runtime, async (db) => (await db.request.updateMany(args)).count),
  }),
  findFirst: async (args: any) => {
    for (const db of runtimeDbs(runtime)) {
      const found = await db.request.findFirst(args);
      if (found) return found;
    }
    return null;
  },
  findMany: async (args: any) => {
    const rows = (
      await Promise.all(runtimeDbs(runtime).map((db) => db.request.findMany(args)))
    ).flat();
    if (args?.orderBy?.createdAt) {
      const dir = args.orderBy.createdAt === 'desc' ? -1 : 1;
      rows.sort(
        (a: any, b: any) =>
          dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      );
    }
    return args?.take ? rows.slice(0, args.take) : rows;
  },
});

export interface GraphqlContext {
  host: GalleryHost;
  user?: any;
  projectId?: string;
}

export function resolvers({ host, user, projectId }: GraphqlContext) {
  const userDefaultProject = user?.defaultProjectId || user?.projects?.[0]?.id;
  const activeProjectId = projectId || userDefaultProject || host.defaultProjectId || 'artmoments';
  const repo = host.galleryRepo;
  const defPrisma = definitionsOf(host);

  return {
    me: async () => {
      if (!user) return null;
      const roleObjects = (user.roles || []).map((r: any) => {
        if (typeof r === 'string') {
          return { id: `role_${r}`, name: r, description: null };
        }
        return {
          id: r.id || `role_${r.name}`,
          name: r.name,
          description: r.description || null,
        };
      });
      const projects = Array.isArray(user.projects)
        ? user.projects
        : await host.getUserProjects(user);
      const defaultProjectId =
        user.defaultProjectId || projects[0]?.id || host.defaultProjectId || 'artmoments';

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        googleId: user.googleId || null,
        roles: roleObjects,
        projects,
        defaultProjectId,
        createdAt: user.createdAt
          ? typeof user.createdAt === 'string'
            ? user.createdAt
            : user.createdAt.toISOString()
          : new Date().toISOString(),
        updatedAt: user.updatedAt
          ? typeof user.updatedAt === 'string'
            ? user.updatedAt
            : user.updatedAt.toISOString()
          : new Date().toISOString(),
      };
    },

    // =========================================================================
    // Public & Admin Gallery Queries
    // =========================================================================
    galleryInfo: async (args: { projectId?: string }) => {
      const info = await repo.getGalleryInfo({ projectId: args?.projectId || activeProjectId });
      return {
        ...info,
        name: info.title,
        description: info.subtitle,
        contact: {
          phone: info.phone,
          email: info.email,
        },
        logoPrimaryUrl: info.logoLightUrl,
        logoSecondaryUrl: info.logoDarkUrl,
      };
    },

    galleryCategories: async (args: { projectId?: string; includeUnpublished?: boolean }) => {
      return repo.listCategories({
        projectId: args?.projectId || activeProjectId,
        includeUnpublished: args?.includeUnpublished ?? false,
      });
    },

    galleryAuthors: async (args: { projectId?: string }) => {
      return repo.listAuthors({ projectId: args?.projectId || activeProjectId });
    },

    galleryItems: async (args: {
      projectId?: string;
      search?: string;
      categoryKey?: string;
      categoryLink?: string;
      authorKey?: string;
      publishedOnly?: boolean;
      limit?: number;
      offset?: number;
    }) => {
      const res = await repo.searchItems({
        projectId: args?.projectId || activeProjectId,
        search: args?.search,
        categoryKey: args?.categoryKey,
        categoryLink: args?.categoryLink,
        authorKey: args?.authorKey,
        publishedOnly: args?.publishedOnly ?? true,
        limit: args?.limit ?? 100,
        offset: args?.offset ?? 0,
      });
      return res.items.map((it) => ({
        ...it,
        title: it.name,
      }));
    },

    galleryItemsCount: async (args: {
      projectId?: string;
      search?: string;
      categoryKey?: string;
      categoryLink?: string;
      authorKey?: string;
      publishedOnly?: boolean;
    }) => {
      const res = await repo.searchItems({
        projectId: args?.projectId || activeProjectId,
        search: args?.search,
        categoryKey: args?.categoryKey,
        categoryLink: args?.categoryLink,
        authorKey: args?.authorKey,
        publishedOnly: args?.publishedOnly ?? true,
        limit: 1,
        offset: 0,
      });
      return res.total;
    },

    galleryItem: async (args: { projectId?: string; key?: string; link?: string }) => {
      const lookup = args?.key || args?.link;
      if (!lookup) return null;
      const item = await repo.getItem({
        projectId: args?.projectId || activeProjectId,
        keyOrLink: lookup,
      });
      if (!item) return null;
      return {
        ...item,
        title: item.name,
      };
    },

    galleryStats: async (args: { projectId?: string }) => {
      const stats = await repo.getStats({ projectId: args?.projectId || activeProjectId });
      return {
        ...stats,
        unpublishedItems: stats.draftItems,
        categoriesCount: stats.totalCategories,
        authorsCount: stats.totalAuthors,
        attachmentsCount: stats.totalAttachments,
      };
    },

    // =========================================================================
    // Curator Console & Harness Diagnostics Queries
    // =========================================================================
    metrics: async () => {
      const totalRequests = await requestsOf(host).count();
      const completedRequests = await requestsOf(host).count({ where: { status: 'COMPLETED' } });
      const failedRequests = await requestsOf(host).count({
        where: { status: 'FAILED' },
      });
      const totalAgents = await defPrisma.agent.count({ where: { existent: true } });
      const activeAgents = await defPrisma.agent.count({
        where: { existent: true, enabled: true },
      });
      const totalTools = host.engine.getAllTools().length;
      const dbUrl = process.env.CURATOR_DATABASE_URL || process.env.DATABASE_URL || '';
      const databaseEngine =
        dbUrl.startsWith('mysql://') || dbUrl.startsWith('mariadb://') ? 'MariaDB' : 'SQLite';

      return {
        totalRequests,
        completedRequests,
        failedRequests,
        totalAgents,
        activeAgents,
        totalTools,
        databaseEngine,
      };
    },

    curatorDatabaseHealth: async () => {
      const dbUrl = process.env.CURATOR_DATABASE_URL || process.env.DATABASE_URL || '';
      const storageEngine =
        dbUrl.startsWith('mysql://') || dbUrl.startsWith('mariadb://')
          ? 'MariaDB (cPanel)'
          : 'SQLite3 (Curator Core)';

      const [
        projectsCount,
        resourcesCount,
        attachmentsCount,
        relationsCount,
        textsCount,
        requestsTotal,
        requestsCompleted,
        requestsFailed,
        agentsTotal,
        agentsActive,
      ] = await Promise.all([
        defPrisma.project.count(),
        defPrisma.resource.count({ where: { existent: true } }),
        defPrisma.attachment.count({ where: { existent: true } }),
        defPrisma.relation.count({ where: { existent: true } }),
        defPrisma.text.count({ where: { existent: true } }),
        requestsOf(host).count(),
        requestsOf(host).count({ where: { status: 'COMPLETED' } }),
        requestsOf(host).count({ where: { status: 'FAILED' } }),
        defPrisma.agent.count({ where: { existent: true } }),
        defPrisma.agent.count({ where: { existent: true, enabled: true } }),
      ]);

      const requestsPending = Math.max(0, requestsTotal - requestsCompleted - requestsFailed);

      return {
        storageEngine,
        isOpfs: false,
        tables: [
          { name: 'Project', rowCount: projectsCount },
          { name: 'Resource', rowCount: resourcesCount },
          { name: 'Attachment', rowCount: attachmentsCount },
          { name: 'Relation', rowCount: relationsCount },
          { name: 'Text', rowCount: textsCount },
          { name: 'Agent', rowCount: agentsTotal },
          { name: 'Request', rowCount: requestsTotal },
        ],
        requestsTotal,
        requestsCompleted,
        requestsFailed,
        requestsPending,
        agentsTotal,
        agentsActive,
      };
    },

    tools: async () => {
      return host.engine.getAllTools().map((t: any) => ({
        name: t.name,
        description: t.description || '',
        accessLevel: t.accessLevel || 'safe_read',
        parameters: t.parameters || null,
      }));
    },

    agents: async () => {
      const rows = await defPrisma.agent.findMany({
        where: { existent: true },
        include: { script: true },
      });
      return rows.map((a: any) => ({
        id: String(a.id),
        name: a.name,
        description: a.script?.description || `Gallery agent ${a.name}`,
        schedule: a.schedule || '0 * * * *',
        enabled: Boolean(a.enabled),
        isActive: Boolean(a.enabled),
        ast: typeof a.script?.ast === 'string' ? a.script.ast : JSON.stringify(a.script?.ast || {}),
      }));
    },

    curatorAgents: async () => {
      const rows = await defPrisma.agent.findMany({
        where: { existent: true },
        include: { script: true },
      });
      const stats = await repo.getStats({ projectId: activeProjectId });
      return rows.map((a: any) => ({
        id: String(a.id),
        name: a.name,
        description: a.script?.description || `Gallery agent ${a.name}`,
        schedule: a.schedule || '0 * * * *',
        enabled: Boolean(a.enabled),
        isActive: Boolean(a.enabled),
        ast: typeof a.script?.ast === 'string' ? a.script.ast : JSON.stringify(a.script?.ast || {}),
        episodesCount: stats.totalCategories,
        tracksCount: stats.totalItems,
        lastRunAt: a.lastPolledAt
          ? typeof a.lastPolledAt === 'string'
            ? a.lastPolledAt
            : a.lastPolledAt.toISOString()
          : 'Ready',
      }));
    },

    curatorRequests: async ({ limit = 20 }: { limit?: number } = {}) => {
      const rows = await requestsOf(host).findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(Number(limit) || 20, 1), 100),
        include: { responses: true, script: true },
      });
      return rows.map((r: any) => ({
        id: String(r.id),
        scriptId: r.scriptId != null ? String(r.scriptId) : null,
        parentId: r.parentId != null ? String(r.parentId) : null,
        notifyId: r.notifyId != null ? String(r.notifyId) : null,
        toolName: r.toolName ?? null,
        status: r.status,
        retryCount: r.retryCount ?? 0,
        ast: typeof r.ast === 'string' ? r.ast : r.ast ? JSON.stringify(r.ast) : null,
        context:
          typeof r.context === 'string'
            ? r.context
            : r.context
              ? JSON.stringify(r.context)
              : null,
        scheduledAt: r.scheduledAt
          ? typeof r.scheduledAt === 'string'
            ? r.scheduledAt
            : r.scheduledAt.toISOString()
          : null,
        createdAt: r.createdAt
          ? typeof r.createdAt === 'string'
            ? r.createdAt
            : r.createdAt.toISOString()
          : null,
        updatedAt: r.updatedAt
          ? typeof r.updatedAt === 'string'
            ? r.updatedAt
            : r.updatedAt.toISOString()
          : null,
        agentName: r.script?.name ?? r.agentId ?? 'gallery_agent',
        responses: [
          ...(r.responses || []).map((res: any) => ({
            id: String(res.id),
            requestId: String(res.requestId),
            content: res.content,
            createdAt: res.createdAt
              ? typeof res.createdAt === 'string'
                ? res.createdAt
                : res.createdAt.toISOString()
              : null,
          })),
          ...(r.output != null
            ? [
                {
                  id: `output:${r.id}`,
                  requestId: String(r.id),
                  content: typeof r.output === 'string' ? r.output : JSON.stringify(r.output),
                  createdAt: null,
                },
              ]
            : []),
        ],
      }));
    },

    curatorRequest: async ({ id }: { id: string }) => {
      const r = await requestsOf(host).findFirst({
        where: { id: isNaN(Number(id)) ? id : Number(id) },
        include: { responses: true, script: true },
      });
      if (!r) return null;
      return {
        id: String(r.id),
        status: r.status,
        ast: typeof r.ast === 'string' ? r.ast : r.ast ? JSON.stringify(r.ast) : null,
        context:
          typeof r.context === 'string'
            ? r.context
            : r.context
              ? JSON.stringify(r.context)
              : null,
        responses: [
          ...(r.responses || []).map((res: any) => ({
            id: String(res.id),
            requestId: String(res.requestId),
            content: res.content,
            createdAt: null,
          })),
          ...(r.output != null
            ? [
                {
                  id: `output:${r.id}`,
                  requestId: String(r.id),
                  content: typeof r.output === 'string' ? r.output : JSON.stringify(r.output),
                  createdAt: null,
                },
              ]
            : []),
        ],
      };
    },

    // =========================================================================
    // Mutations (Routed via host.runTool / host.emitEvent / host.triggerAgent)
    // =========================================================================
    executeTool: async ({ name, args }: { name: string; args?: any }) => {
      try {
        const parsedArgs =
          typeof args === 'string' ? JSON.parse(args || '{}') : args || {};
        const execOut = await host.runTool(name, {
          projectId: activeProjectId,
          ...parsedArgs,
        });
        const result = execOut?.result !== undefined ? execOut.result : execOut;
        return {
          success: true,
          tool: name,
          result,
          error: null,
        };
      } catch (err: any) {
        return {
          success: false,
          tool: name,
          result: null,
          error: err?.message || String(err),
        };
      }
    },

    triggerAgent: async (args: {
      name?: string;
      id?: string;
      agentName?: string;
      context?: any;
      refresh?: boolean;
    }) => {
      try {
        const targetName =
          args.name || args.agentName || args.id || 'gallery_thumbnail_maintainer';
        const parsedContext =
          typeof args.context === 'string'
            ? JSON.parse(args.context || '{}')
            : args.context || {};
        const req = await host.triggerAgent(targetName, {
          refresh: args.refresh ?? false,
          ...parsedContext,
        });
        return {
          id: `resp-${req.id}`,
          requestId: String(req.id),
          agent: targetName,
          content: `Agent workflow '${targetName}' enqueued (Request #${req.id}).`,
          status: 'pending',
          createdAt: new Date().toISOString(),
          success: true,
          error: null,
        };
      } catch (err: any) {
        return {
          id: null,
          requestId: null,
          agent: args.name || args.agentName || null,
          content: null,
          status: 'failed',
          createdAt: new Date().toISOString(),
          success: false,
          error: err?.message || String(err),
        };
      }
    },

    triggerCuratorAgent: async (args: {
      name?: string;
      agentName?: string;
      refresh?: boolean;
    }) => {
      const targetName = args.name || args.agentName || 'gallery_thumbnail_maintainer';
      const req = await host.triggerAgent(targetName, { refresh: args.refresh ?? false });
      return {
        id: `resp-${req.id}`,
        requestId: String(req.id),
        agent: targetName,
        content: `Agent workflow '${targetName}' enqueued (Request #${req.id}).`,
        status: 'pending',
        createdAt: new Date().toISOString(),
        success: true,
        error: null,
      };
    },

    toggleAgent: async (args: { id: string; enabled?: boolean; isActive?: boolean }) => {
      const activeState = args.enabled !== undefined ? args.enabled : Boolean(args.isActive);
      const numericId = isNaN(Number(args.id)) ? undefined : Number(args.id);
      const agent = await defPrisma.agent.findFirst({
        where: numericId ? { OR: [{ id: numericId }, { name: args.id }] } : { name: args.id },
      });
      if (!agent) throw new Error(`Agent '${args.id}' not found`);
      const updated = await defPrisma.agent.update({
        where: { id: agent.id },
        data: { enabled: activeState },
      });
      await (host as any).syncDefinitions?.();
      return {
        id: String(updated.id),
        name: updated.name,
        schedule: updated.schedule,
        enabled: Boolean(updated.enabled),
        isActive: Boolean(updated.enabled),
      };
    },

    toggleCuratorAgent: async (args: { id: string; enabled?: boolean; isActive?: boolean }) => {
      const activeState = args.enabled !== undefined ? args.enabled : Boolean(args.isActive);
      const numericId = isNaN(Number(args.id)) ? undefined : Number(args.id);
      const agent = await defPrisma.agent.findFirst({
        where: numericId ? { OR: [{ id: numericId }, { name: args.id }] } : { name: args.id },
      });
      if (!agent) throw new Error(`Agent '${args.id}' not found`);
      const updated = await defPrisma.agent.update({
        where: { id: agent.id },
        data: { enabled: activeState },
      });
      await (host as any).syncDefinitions?.();
      return {
        id: String(updated.id),
        name: updated.name,
        schedule: updated.schedule,
        enabled: Boolean(updated.enabled),
        isActive: Boolean(updated.enabled),
      };
    },

    updateAgentSchedule: async ({ id, schedule }: { id: string; schedule: string }) => {
      const numericId = isNaN(Number(id)) ? undefined : Number(id);
      const agent = await defPrisma.agent.findFirst({
        where: numericId ? { OR: [{ id: numericId }, { name: id }] } : { name: id },
      });
      if (!agent) throw new Error(`Agent '${id}' not found`);
      const updated = await defPrisma.agent.update({
        where: { id: agent.id },
        data: { schedule: schedule.trim() },
      });
      await (host as any).syncDefinitions?.();
      return {
        id: String(updated.id),
        name: updated.name,
        schedule: updated.schedule,
        enabled: Boolean(updated.enabled),
        isActive: Boolean(updated.enabled),
      };
    },

    deleteAgent: async ({ id }: { id: string }) => {
      const numericId = isNaN(Number(id)) ? undefined : Number(id);
      const agent = await defPrisma.agent.findFirst({
        where: numericId ? { OR: [{ id: numericId }, { name: id }] } : { name: id },
      });
      if (!agent) return false;
      await defPrisma.agent.update({
        where: { id: agent.id },
        data: { existent: false, enabled: false, deletedAt: new Date() },
      });
      await (host as any).syncDefinitions?.();
      return true;
    },

    compileCoffeeScript: async ({ code }: { code: string }) => {
      try {
        const ast = compileCoffeeScriptToAST(code);
        return {
          success: true,
          ast,
          error: null,
        };
      } catch (err: any) {
        return {
          success: false,
          ast: null,
          error: err?.message || String(err),
        };
      }
    },

    broadcastEvent: async ({ type, payload }: { type: string; payload?: any }) => {
      const parsedPayload =
        typeof payload === 'string' ? JSON.parse(payload || '{}') : payload || {};
      await host.emitEvent(type, parsedPayload);
      return true;
    },

    toggleEnginePause: async () => {
      const proc = host.processor as any;
      if (proc) {
        proc.isPaused = !proc.isPaused;
        return Boolean(proc.isPaused);
      }
      return false;
    },
  };
}

export async function executeGraphql(
  source: string,
  variables: Record<string, any> = {},
  ctx: GraphqlContext
) {
  const rawResolvers = resolvers(ctx);
  const rootValue = wrapResolversWithAuth(schema, rawResolvers, ctx.user, authEngine);

  return graphql({
    schema,
    source,
    rootValue,
    variableValues: variables,
  });
}
