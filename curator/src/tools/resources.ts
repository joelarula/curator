import { defineTool, type CuratorToolContext } from './CuratorTool.js';
import { ManagementGuardService as Guard, actorFromToolContext } from '../services/ManagementGuardService.js';
import { SYSTEM_PROJECT_ID } from '../services/ProjectScopeService.js';

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

function optString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw new Error(`'${key}' must be a string.`);
  return v.trim();
}

async function resolveOrCreateResource(
  prisma: any,
  uri: string,
  userId: string,
  projectId: string | null
): Promise<any> {
  const safeTitle = uri.substring(0, 250);
  return prisma.resource.upsert({
    where: { uri },
    update: { deletedAt: null, existent: true },
    create: {
      uri,
      title: safeTitle,
      userId,
      projectId,
      isPublished: false,
      deletedAt: null,
      existent: true,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource Search and Filtering
// ─────────────────────────────────────────────────────────────────────────────

export const search_resources = defineTool({
  name: 'search_resources',
  aliases: ['query_resources'],
  description: 'Searches, filters, and paginates knowledge base resources by query, URI prefix, RDF type/class, or relation predicate within the current workspace and readable project scopes.',
  accessLevel: 'safe_read',
  requiredRole: 'agent:reader',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keyword query matching title or description.' },
      uriPrefix: { type: 'string', description: 'Filter by URI prefix (e.g. "article:", "user:", "https://").' },
      type: { type: 'string', description: 'Filter by RDF type (e.g. "schema:Article", "schema:Person").' },
      predicate: { type: 'string', description: 'Filter by RDF relation predicate URI.' },
      objectUri: { type: 'string', description: 'Filter by RDF relation object URI.' },
      includeTexts: { type: 'boolean', description: 'Whether to include attached Text records (default: false).' },
      includeRelations: { type: 'boolean', description: 'Whether to include subject/object relations (default: false).' },
      limit: { type: 'number', description: 'Maximum number of results to return (default: 20, max: 100).' },
      offset: { type: 'number', description: 'Number of results to skip (default: 0).' },
    },
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);

    const query = optString(args, 'query');
    const uriPrefix = optString(args, 'uriPrefix');
    const typeUri = optString(args, 'type');
    const predicateUri = optString(args, 'predicate');
    const objectUri = optString(args, 'objectUri');
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
    const offset = Math.max(Number(args.offset) || 0, 0);

    const whereConditions: any[] = [
      { existent: true },
      await Guard.readableWhere(prisma, actor),
    ];

    if (query) {
      whereConditions.push({
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
        ],
      });
    }

    if (uriPrefix) {
      whereConditions.push({
        uri: { startsWith: uriPrefix },
      });
    }

    if (typeUri) {
      whereConditions.push({
        subjectRelations: {
          some: {
            predicate: { uri: 'rdf:type' },
            object: { uri: typeUri },
            existent: true,
          },
        },
      });
    }

    if (predicateUri || objectUri) {
      const relFilter: any = { existent: true };
      if (predicateUri) relFilter.predicate = { uri: predicateUri };
      if (objectUri) relFilter.object = { uri: objectUri };
      whereConditions.push({
        subjectRelations: { some: relFilter },
      });
    }

    const where = { AND: whereConditions };

    const [totalCount, resources] = await Promise.all([
      prisma.resource.count({ where }),
      prisma.resource.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { updatedAt: 'desc' },
        include: {
          texts: args.includeTexts === true ? { where: { existent: true } } : false,
          subjectRelations: args.includeRelations === true ? {
            where: { existent: true },
            include: { predicate: true, object: true },
            take: 20,
          } : false,
        },
      }),
    ]);

    const formatted = resources.map((r: any) => ({
      id: r.id,
      uri: r.uri,
      title: r.title,
      description: r.description,
      isPublished: r.isPublished,
      projectId: r.projectId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      ...(args.includeTexts === true && {
        texts: (r.texts || []).map((t: any) => ({
          role: t.role,
          mimeType: t.mimeType,
          content: t.content?.length > 300 ? `${t.content.substring(0, 300)}...` : t.content,
        })),
      }),
      ...(args.includeRelations === true && {
        relations: (r.subjectRelations || []).map((rel: any) => ({
          predicate: rel.predicate?.uri,
          object: rel.object?.uri,
          literal: rel.literalString ?? rel.literalValue ?? rel.literalBoolean ?? rel.literalDate,
        })),
      }),
    }));

    return { total: totalCount, offset, limit, count: formatted.length, resources: formatted };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Raw Resource CRUD
// ─────────────────────────────────────────────────────────────────────────────

export const upsert_resource = defineTool({
  name: 'upsert_resource',
  description: 'Idempotently creates or updates a raw Resource by URI. Updates title, description, publication flag, and custom metadata within the workspace project.',
  accessLevel: 'safe_write',
  requiredRole: 'agent:writer',
  parameters: {
    type: 'object',
    properties: {
      uri: { type: 'string', description: 'Unique URI of the resource (e.g. "article:101", "https://example.com/doc").' },
      title: { type: 'string', description: 'Human-readable title.' },
      description: { type: 'string', description: 'Brief description or abstract.' },
      isPublished: { type: 'boolean', description: 'Whether the resource is published (default: false).' },
      metadata: { type: 'object', description: 'Optional JSON metadata payload.' },
      projectId: { type: 'string', description: 'Sub-project to place the resource in (default: current workspace).' },
    },
    required: ['uri'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const uri = requireString(args, 'uri');
    const title = optString(args, 'title') ?? uri;
    const description = optString(args, 'description');
    const isPublished = typeof args.isPublished === 'boolean' ? args.isPublished : false;
    const metadata = (args.metadata && typeof args.metadata === 'object') ? args.metadata : undefined;

    const targetProjectId = optString(args, 'projectId') ?? actor.projectId ?? SYSTEM_PROJECT_ID;
    await Guard.assertWritableProject(prisma, actor, targetProjectId);

    const userId = actor.userId ?? 'system';
    const safeTitle = title.substring(0, 250);

    const resource = await prisma.resource.upsert({
      where: { uri },
      update: {
        title: safeTitle,
        ...(description !== undefined && { description }),
        ...(args.isPublished !== undefined && { isPublished }),
        ...(metadata !== undefined && { metadata }),
        existent: true,
        deletedAt: null,
      },
      create: {
        uri,
        title: safeTitle,
        description: description ?? null,
        isPublished,
        ...(metadata !== undefined && { metadata }),
        userId,
        projectId: targetProjectId,
        existent: true,
        deletedAt: null,
      },
    });

    return { ok: true, resource: { id: resource.id, uri: resource.uri, title: resource.title, projectId: resource.projectId } };
  },
});

export const get_resource = defineTool({
  name: 'get_resource',
  description: 'Fetches a single raw Resource by URI or numeric ID, including attached texts, incoming/outgoing relations, and attachments.',
  accessLevel: 'safe_read',
  requiredRole: 'agent:reader',
  parameters: {
    type: 'object',
    properties: {
      uri: { type: 'string', description: 'Resource URI.' },
      id: { type: 'number', description: 'Resource numeric ID (alternative to URI).' },
    },
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const uri = optString(args, 'uri');
    const id = args.id !== undefined && !Number.isNaN(Number(args.id)) ? Number(args.id) : undefined;
    if (!uri && id === undefined) throw new Error("Must provide either 'uri' or 'id'.");

    const readableWhere = await Guard.readableWhere(prisma, actor);
    const where: any = {
      AND: [
        id !== undefined ? { id } : { uri },
        { existent: true },
        readableWhere,
      ],
    };

    const resource = await prisma.resource.findFirst({
      where,
      include: {
        texts: { where: { existent: true } },
        subjectRelations: {
          where: { existent: true },
          include: { predicate: true, object: true },
        },
        objectRelations: {
          where: { existent: true },
          include: { subject: true, predicate: true },
        },
        attachments: { where: { existent: true } },
      },
    });

    if (!resource) {
      return { found: false, message: `Resource '${uri ?? id}' not found in accessible scope.` };
    }

    return {
      found: true,
      resource: {
        id: resource.id,
        uri: resource.uri,
        title: resource.title,
        description: resource.description,
        isPublished: resource.isPublished,
        projectId: resource.projectId,
        metadata: resource.metadata,
        texts: resource.texts.map((t: any) => ({
          id: t.id,
          role: t.role,
          mimeType: t.mimeType,
          extension: t.extension,
          content: t.content,
        })),
        relations: resource.subjectRelations.map((r: any) => ({
          predicate: r.predicate?.uri,
          object: r.object?.uri,
          literal: r.literalString ?? r.literalValue ?? r.literalBoolean ?? r.literalDate,
        })),
        incomingRelations: resource.objectRelations.map((r: any) => ({
          subject: r.subject?.uri,
          predicate: r.predicate?.uri,
        })),
        attachments: (resource.attachments || []).map((a: any) => ({
          id: a.id,
          uri: a.uri,
          filename: a.filename,
          mimetype: a.mimetype,
          size: a.size,
          url: a.url,
        })),
      },
    };
  },
});

export const delete_resource = defineTool({
  name: 'delete_resource',
  description: 'Deletes a Resource by URI or ID. Performs a soft delete by default (or hard delete with hardDelete=true cascading to its relations and texts).',
  accessLevel: 'destructive',
  requiredRole: 'agent:writer',
  requiresHumanApproval: true,
  parameters: {
    type: 'object',
    properties: {
      uri: { type: 'string', description: 'Resource URI.' },
      id: { type: 'number', description: 'Resource ID.' },
      hardDelete: { type: 'boolean', description: 'Whether to permanently delete from database (default: false, soft-deletes).' },
    },
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const uri = optString(args, 'uri');
    const id = args.id !== undefined && !Number.isNaN(Number(args.id)) ? Number(args.id) : undefined;
    if (!uri && id === undefined) throw new Error("Must provide either 'uri' or 'id'.");

    const resource = await prisma.resource.findFirst({
      where: id !== undefined ? { id } : { uri },
    });
    if (!resource || resource.existent === false) {
      return { ok: true, deleted: false, message: `Resource not found.` };
    }

    await Guard.assertWritableProject(prisma, actor, resource.projectId);

    if (args.hardDelete === true) {
      await prisma.resource.delete({ where: { id: resource.id } });
      return { ok: true, deleted: true, action: 'hard_deleted', uri: resource.uri };
    } else {
      const now = new Date();
      await prisma.resource.update({
        where: { id: resource.id },
        data: { existent: false, deletedAt: now },
      });
      await prisma.relation.updateMany({
        where: { OR: [{ subjectId: resource.id }, { objectId: resource.id }] },
        data: { existent: false },
      });
      await prisma.text.updateMany({
        where: { resourceId: resource.id },
        data: { existent: false, deletedAt: now },
      });
      return { ok: true, deleted: true, action: 'soft_deleted', uri: resource.uri };
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Raw Text CRUD
// ─────────────────────────────────────────────────────────────────────────────

export const upsert_text = defineTool({
  name: 'upsert_text',
  description: 'Idempotently creates or updates a Text record attached to a Resource (identified by resourceUri or resourceId and role, e.g. MAIN, SUMMARY, HTML, TRANSCRIPT, EMBEDDING).',
  accessLevel: 'safe_write',
  requiredRole: 'agent:writer',
  parameters: {
    type: 'object',
    properties: {
      resourceUri: { type: 'string', description: 'Target resource URI.' },
      resourceId: { type: 'number', description: 'Target resource numeric ID.' },
      role: { type: 'string', description: 'Text role (default: "MAIN", uppercase e.g. SUMMARY, HTML).' },
      content: { type: 'string', description: 'Full text content.' },
      mimeType: { type: 'string', description: 'MIME type (default: "text/plain").' },
      extension: { type: 'string', description: 'File extension (default: "txt").' },
    },
    required: ['content'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const content = requireString(args, 'content');
    const role = (optString(args, 'role') ?? 'MAIN').toUpperCase();
    const mimeType = optString(args, 'mimeType') ?? 'text/plain';
    const extension = optString(args, 'extension') ?? 'txt';

    const uri = optString(args, 'resourceUri');
    const id = args.resourceId !== undefined && !Number.isNaN(Number(args.resourceId)) ? Number(args.resourceId) : undefined;
    if (!uri && id === undefined) throw new Error("Must provide either 'resourceUri' or 'resourceId'.");

    const resource = await prisma.resource.findFirst({
      where: id !== undefined ? { id } : { uri },
    });
    if (!resource || resource.existent === false) {
      throw new Error(`Target resource '${uri ?? id}' not found.`);
    }

    await Guard.assertWritableProject(prisma, actor, resource.projectId);
    const userId = actor.userId ?? 'system';

    const text = await prisma.text.upsert({
      where: { resourceId_role: { resourceId: resource.id, role } },
      update: {
        content,
        mimeType,
        extension,
        existent: true,
        deletedAt: null,
      },
      create: {
        resourceId: resource.id,
        role,
        content,
        mimeType,
        extension,
        userId,
        existent: true,
      },
    });

    return { ok: true, textId: text.id, role: text.role, resourceUri: resource.uri };
  },
});

export const delete_text = defineTool({
  name: 'delete_text',
  description: 'Soft-deletes a Text record by ID or by resourceUri + role.',
  accessLevel: 'destructive',
  requiredRole: 'agent:writer',
  requiresHumanApproval: true,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Text CUID.' },
      resourceUri: { type: 'string', description: 'Resource URI.' },
      role: { type: 'string', description: 'Text role (e.g. MAIN).' },
    },
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const textId = optString(args, 'id');
    const resourceUri = optString(args, 'resourceUri');
    const role = optString(args, 'role')?.toUpperCase();

    let text: any = null;
    if (textId) {
      text = await prisma.text.findUnique({ where: { id: textId }, include: { resource: true } });
    } else if (resourceUri && role) {
      const resource = await prisma.resource.findUnique({ where: { uri: resourceUri } });
      if (resource) {
        text = await prisma.text.findUnique({
          where: { resourceId_role: { resourceId: resource.id, role } },
          include: { resource: true },
        });
      }
    } else {
      throw new Error("Must provide 'id' or both 'resourceUri' and 'role'.");
    }

    if (!text || text.existent === false) {
      return { ok: true, deleted: false, message: 'Text record not found.' };
    }

    if (text.resource) {
      await Guard.assertWritableProject(prisma, actor, text.resource.projectId);
    }

    await prisma.text.update({
      where: { id: text.id },
      data: { existent: false, deletedAt: new Date() },
    });

    return { ok: true, deleted: true, textId: text.id, role: text.role };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Raw RDF Relations (Triples)
// ─────────────────────────────────────────────────────────────────────────────

export const upsert_relation = defineTool({
  name: 'upsert_relation',
  description: 'Idempotently creates or updates an RDF triple relation (subjectUri, predicateUri, objectUri) with optional literal values.',
  accessLevel: 'safe_write',
  requiredRole: 'agent:writer',
  parameters: {
    type: 'object',
    properties: {
      subjectUri: { type: 'string', description: 'Subject resource URI.' },
      predicateUri: { type: 'string', description: 'Predicate relation URI (e.g. "schema:author", "schema:inLanguage").' },
      objectUri: { type: 'string', description: 'Object resource URI.' },
      literalString: { type: 'string', description: 'Optional literal string value.' },
      literalValue: { type: 'number', description: 'Optional literal numeric value.' },
      literalBoolean: { type: 'boolean', description: 'Optional literal boolean value.' },
      literalDate: { type: 'string', description: 'Optional literal ISO 8601 date string.' },
      literalDatatype: { type: 'string', description: 'Datatype URI (e.g. "xsd:string", "xsd:integer").' },
      justification: { type: 'string', description: 'Optional justification for this relation.' },
    },
    required: ['subjectUri', 'predicateUri', 'objectUri'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const subjectUri = requireString(args, 'subjectUri');
    const predicateUri = requireString(args, 'predicateUri');
    const objectUri = requireString(args, 'objectUri');

    const targetProjectId = actor.projectId ?? SYSTEM_PROJECT_ID;
    await Guard.assertWritableProject(prisma, actor, targetProjectId);
    const userId = actor.userId ?? 'system';

    const [subject, predicate, object] = await Promise.all([
      resolveOrCreateResource(prisma, subjectUri, userId, targetProjectId),
      resolveOrCreateResource(prisma, predicateUri, userId, targetProjectId),
      resolveOrCreateResource(prisma, objectUri, userId, targetProjectId),
    ]);

    const literalDate = optString(args, 'literalDate') ? new Date(args.literalDate as string) : undefined;

    const relation = await prisma.relation.upsert({
      where: {
        subjectId_predicateId_objectId: {
          subjectId: subject.id,
          predicateId: predicate.id,
          objectId: object.id,
        },
      },
      update: {
        existent: true,
        ...(args.literalString !== undefined && { literalString: optString(args, 'literalString') }),
        ...(args.literalValue !== undefined && { literalValue: Number(args.literalValue) }),
        ...(args.literalBoolean !== undefined && { literalBoolean: Boolean(args.literalBoolean) }),
        ...(literalDate !== undefined && { literalDate }),
        ...(args.literalDatatype !== undefined && { literalDatatype: optString(args, 'literalDatatype') }),
        ...(args.justification !== undefined && { justification: optString(args, 'justification') }),
      },
      create: {
        subjectId: subject.id,
        predicateId: predicate.id,
        objectId: object.id,
        projectId: targetProjectId,
        existent: true,
        ...(args.literalString !== undefined && { literalString: optString(args, 'literalString') }),
        ...(args.literalValue !== undefined && { literalValue: Number(args.literalValue) }),
        ...(args.literalBoolean !== undefined && { literalBoolean: Boolean(args.literalBoolean) }),
        ...(literalDate !== undefined && { literalDate }),
        ...(args.literalDatatype !== undefined && { literalDatatype: optString(args, 'literalDatatype') }),
        ...(args.justification !== undefined && { justification: optString(args, 'justification') }),
      },
    });

    return { ok: true, relationId: relation.id, triple: `<${subjectUri}> <${predicateUri}> <${objectUri}>` };
  },
});

export const delete_relation = defineTool({
  name: 'delete_relation',
  description: 'Deletes an RDF relation triple by subjectUri, predicateUri, and objectUri.',
  accessLevel: 'destructive',
  requiredRole: 'agent:writer',
  parameters: {
    type: 'object',
    properties: {
      subjectUri: { type: 'string', description: 'Subject resource URI.' },
      predicateUri: { type: 'string', description: 'Predicate resource URI.' },
      objectUri: { type: 'string', description: 'Object resource URI.' },
    },
    required: ['subjectUri', 'predicateUri', 'objectUri'],
  },
  execute: async (args: Record<string, unknown>, ctx: Ctx) => {
    const prisma = requirePrisma(ctx);
    const actor = actorFromToolContext(ctx);
    const subjectUri = requireString(args, 'subjectUri');
    const predicateUri = requireString(args, 'predicateUri');
    const objectUri = requireString(args, 'objectUri');

    const [subject, predicate, object] = await Promise.all([
      prisma.resource.findUnique({ where: { uri: subjectUri } }),
      prisma.resource.findUnique({ where: { uri: predicateUri } }),
      prisma.resource.findUnique({ where: { uri: objectUri } }),
    ]);

    if (!subject || !predicate || !object) {
      return { ok: true, deleted: false, message: 'One or more triple nodes not found.' };
    }

    const res = await prisma.relation.deleteMany({
      where: {
        subjectId: subject.id,
        predicateId: predicate.id,
        objectId: object.id,
        ...(actor.projectId ? { projectId: actor.projectId } : {}),
      },
    });

    return { ok: true, deletedCount: res.count, triple: `<${subjectUri}> <${predicateUri}> <${objectUri}>` };
  },
});

export const resourceTools = {
  search_resources,
  upsert_resource,
  get_resource,
  delete_resource,
  upsert_text,
  delete_text,
  upsert_relation,
  delete_relation,
};

