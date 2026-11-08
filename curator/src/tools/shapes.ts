import { defineTool, type CuratorToolContext } from './CuratorTool.js';
import { SemanticSchemaEngine, type SemanticNodeShape } from '../services/SemanticSchemaEngine.js';
import { coreShapes } from '../model/index.js';
import { ManagementGuardService as Guard, actorFromToolContext } from '../services/ManagementGuardService.js';
import { SYSTEM_PROJECT_ID, ensureSystemProject } from '../services/ProjectScopeService.js';

type Ctx = CuratorToolContext & Record<string, any>;

function requirePrisma(ctx: Ctx): any {
  if (!ctx.prisma) throw new Error('Database connection not available in tool context.');
  return ctx.prisma;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`'${key}' must be a non-empty string.`);
  return v.trim();
}

/**
 * Instantiates a SemanticSchemaEngine preloaded with Curator Core's shapes
 * plus any plugin-registered shapes available in the execution context.
 */
export function getSemanticEngine(prisma: any, ctx?: Ctx): SemanticSchemaEngine {
  const engine = new SemanticSchemaEngine(prisma);
  for (const shape of coreShapes) {
    engine.registerShape(shape);
  }
  if (ctx?.engine?.models) {
    for (const shape of (ctx.engine.models as Map<string, SemanticNodeShape>).values()) {
      engine.registerShape(shape);
    }
  }
  return engine;
}

/**
 * Resolves a shape by URI, targetClass, or name (case-insensitive).
 */
export function resolveShape(engine: SemanticSchemaEngine, ref: string): SemanticNodeShape | undefined {
  const shapes = (engine as any).shapes as Record<string, SemanticNodeShape>;
  if (shapes[ref]) return shapes[ref];
  const refLower = ref.toLowerCase();
  for (const s of Object.values(shapes)) {
    if (
      s.uri.toLowerCase() === refLower ||
      s.targetClass.toLowerCase() === refLower ||
      s.name?.toLowerCase() === refLower ||
      s.uri.toLowerCase().endsWith(refLower) ||
      s.targetClass.toLowerCase().endsWith(refLower)
    ) {
      return s;
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Semantic Shapes Management Tools
// ─────────────────────────────────────────────────────────────────────────────

export const list_shapes = defineTool({
  name: 'list_shapes',
  description: 'Lists all available semantic shapes (such as Article, Person, Folder, MediaObject, DataFeed, WikiPage) along with their properties, datatypes, and validation constraints.',
  accessLevel: 'safe_read',
  requiredRole: 'agent:reader',
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string', description: 'Optional substring filter for shape name, class, or URI.' },
    },
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const engine = getSemanticEngine(prisma, ctx);
    const shapes = Object.values((engine as any).shapes as Record<string, SemanticNodeShape>);
    const filter = typeof args.filter === 'string' ? args.filter.toLowerCase() : undefined;

    const matched = shapes.filter((s) => {
      if (!filter) return true;
      return (
        s.name?.toLowerCase().includes(filter) ||
        s.targetClass.toLowerCase().includes(filter) ||
        s.uri.toLowerCase().includes(filter) ||
        s.description?.toLowerCase().includes(filter)
      );
    });

    const catalog = matched.map((s) => ({
      uri: s.uri,
      targetClass: s.targetClass,
      name: s.name ?? s.targetClass,
      description: s.description ?? null,
      properties: Object.entries(s.properties).map(([field, prop]) => ({
        field,
        path: prop.path,
        name: prop.name ?? field,
        description: prop.description ?? null,
        datatype: prop.datatype ?? null,
        class: prop.class ?? null,
        minCount: prop.minCount ?? 0,
        maxCount: prop.maxCount ?? null,
        in: prop.in ?? null,
      })),
    }));

    return { count: catalog.length, shapes: catalog };
  },
});

export const upsert_shape_entity = defineTool({
  name: 'upsert_shape_entity',
  description: 'Creates or updates a knowledge graph entity conforming to a semantic shape (e.g. Article, Person, Folder, MediaObject). Validates property constraints and automatically generates RDF triples and literal relations within the workspace project.',
  accessLevel: 'safe_write',
  requiredRole: 'agent:writer',
  parameters: {
    type: 'object',
    properties: {
      shape: { type: 'string', description: 'Shape URI, class name, or shape name (e.g. "Article", "schema:Article", or "schema:ArticleShape").' },
      subjectUri: { type: 'string', description: 'Unique URI of the entity (e.g. "article:101", "person:alice").' },
      data: { type: 'object', description: 'Object carrying the property values according to the shape definition.' },
      projectId: { type: 'string', description: 'Sub-project of the workspace to place the entity in (defaults to current workspace).' },
    },
    required: ['shape', 'subjectUri', 'data'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const shapeRef = requireString(args, 'shape');
    const subjectUri = requireString(args, 'subjectUri');
    if (!args.data || typeof args.data !== 'object' || Array.isArray(args.data)) {
      throw new Error(`'data' must be a JSON object containing entity properties.`);
    }

    const engine = getSemanticEngine(prisma, ctx);
    const shape = resolveShape(engine, shapeRef);
    if (!shape) {
      throw new Error(`Semantic shape '${shapeRef}' not found. Call list_shapes to see registered shapes.`);
    }

    const targetProjectId = (typeof args.projectId === 'string' && args.projectId.trim())
      ? args.projectId.trim()
      : (actor.projectId ?? SYSTEM_PROJECT_ID);

    await Guard.assertWritableProject(prisma, actor, targetProjectId);
    await ensureSystemProject(prisma);

    const userId = actor.userId ?? 'system';

    // Check if the entity already exists in this workspace
    const existing = await prisma.resource.findUnique({ where: { uri: subjectUri } });
    if (existing && existing.existent) {
      await engine.updateEntity(shape.uri, subjectUri, args.data as Record<string, any>, userId, targetProjectId);
      return { ok: true, created: false, uri: subjectUri, shape: shape.uri, targetClass: shape.targetClass };
    } else {
      await engine.createEntity(shape.uri, subjectUri, args.data as Record<string, any>, userId, targetProjectId);
      return { ok: true, created: true, uri: subjectUri, shape: shape.uri, targetClass: shape.targetClass };
    }
  },
});

export const get_shape_entity = defineTool({
  name: 'get_shape_entity',
  description: 'Reads an entity by URI and shape, reconstructing the logical properties and relations from RDF triples within the current workspace and readable project scopes.',
  accessLevel: 'safe_read',
  requiredRole: 'agent:reader',
  parameters: {
    type: 'object',
    properties: {
      shape: { type: 'string', description: 'Shape URI or class name (e.g. "Article", "schema:ArticleShape").' },
      subjectUri: { type: 'string', description: 'Entity subject URI.' },
    },
    required: ['shape', 'subjectUri'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const shapeRef = requireString(args, 'shape');
    const subjectUri = requireString(args, 'subjectUri');

    const engine = getSemanticEngine(prisma, ctx);
    const shape = resolveShape(engine, shapeRef);
    if (!shape) {
      throw new Error(`Semantic shape '${shapeRef}' not found. Call list_shapes to see registered shapes.`);
    }

    const readableProjects = await Guard.readableProjectIds(prisma, actor);
    const entity = await engine.readEntity(shape.uri, subjectUri, readableProjects ?? [SYSTEM_PROJECT_ID]);
    if (!entity) {
      return { found: false, uri: subjectUri, shape: shape.uri, data: null };
    }
    return { found: true, uri: subjectUri, shape: shape.uri, targetClass: shape.targetClass, data: entity };
  },
});

export const delete_shape_entity = defineTool({
  name: 'delete_shape_entity',
  description: 'Soft-deletes a semantic entity and its RDF relations within the workspace scope.',
  accessLevel: 'destructive',
  requiredRole: 'agent:writer',
  requiresHumanApproval: true,
  parameters: {
    type: 'object',
    properties: {
      subjectUri: { type: 'string', description: 'Subject URI of the entity to delete.' },
    },
    required: ['subjectUri'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const subjectUri = requireString(args, 'subjectUri');

    const resource = await prisma.resource.findUnique({ where: { uri: subjectUri } });
    if (!resource || resource.existent === false) {
      return { ok: true, deleted: false, message: `Entity '${subjectUri}' not found.` };
    }

    await Guard.assertWritableProject(prisma, actor, resource.projectId);

    const engine = getSemanticEngine(prisma, ctx);
    const targetProjectId = actor.projectId ?? resource.projectId ?? SYSTEM_PROJECT_ID;
    const deleted = await engine.deleteEntity(subjectUri, targetProjectId);
    return { ok: true, deleted, uri: subjectUri };
  },
});

export const shapeTools = {
  list_shapes,
  upsert_shape_entity,
  get_shape_entity,
  delete_shape_entity,
};
