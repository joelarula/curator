import { PrismaClient } from '@prisma/client';
import { executeTool } from '../services/ToolRegistry.js';
import { SYSTEM_PROJECT_ID, getReadableProjectIds, buildProjectScopeWhere } from '../services/ProjectScopeService.js';

function buildReadableResourceScope(context: any) {
    const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
    if (!context.activeProjectId && (!context.activeProjectIds || context.activeProjectIds.length === 0)) {
        return {
            OR: [
                ...scope.OR,
                { userId: context.user.id }
            ]
        };
    }
    return scope;
}


export const resourceResolvers = {
    Query: {
        resource: async (_parent: any, { id }: { id: number }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const where: any = { id, ...buildReadableResourceScope(context) };

            return await context.prisma.resource.findFirst({
                where,

                include: {
                    texts: { where: { existent: true }, orderBy: { createdAt: 'desc' } },
                    subjectRelations: { include: { predicate: true, object: true } },
                    objectRelations: { include: { subject: true, predicate: true } },
                }
            });
        },

        resourceByUri: async (_parent: any, { uri }: { uri: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const where: any = { uri, ...buildReadableResourceScope(context) };

            return await context.prisma.resource.findFirst({
                where,
                include: {
                    texts: { where: { existent: true }, orderBy: { createdAt: 'desc' } },
                    subjectRelations: { include: { predicate: true, object: true } },
                    objectRelations: { include: { subject: true, predicate: true } },
                }
            });
        },

        resources: async (_parent: any, { skip, take, search }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const where: any = { existent: true, ...buildReadableResourceScope(context) };
            if (search) {
                where.AND = [
                    ...(where.AND || []),
                    {
                        OR: [
                            { title: { contains: search, mode: 'insensitive' } },
                            { uri: { contains: search, mode: 'insensitive' } },
                        ],
                    },
                ];
            }

            const [items, totalCount] = await Promise.all([
                context.prisma.resource.findMany({
                    where,
                    skip: skip || 0,
                    take: take || 20,
                    orderBy: { updatedAt: 'desc' },
                }),
                context.prisma.resource.count({ where }),
            ]);

            return { items, totalCount };
        },

        queryResources: async (_parent: any, { filter, skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const prisma = context.prisma;
            const relationProjectWhere = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);

            const where: any = { existent: true, ...buildReadableResourceScope(context) };

            if (filter) {
                if (filter.uriContains) where.uri = { contains: filter.uriContains, mode: 'insensitive' };
                if (filter.titleContains) where.title = { contains: filter.titleContains, mode: 'insensitive' };
                if (filter.search) {
                    where.AND = [
                        ...(where.AND || []),
                        {
                            OR: [
                                { title: { contains: filter.search, mode: 'insensitive' } },
                                { uri: { contains: filter.search, mode: 'insensitive' } },
                                { description: { contains: filter.search, mode: 'insensitive' } }
                            ],
                        },
                    ];
                }
                if (filter.isPublished !== undefined) {
                    where.isPublished = filter.isPublished;
                }
                if (filter.isPredicate !== undefined) {
                    const rdfTypeShorthand = 'rdf:type';
                    const rdfTypeFull = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
                    const predicateClassUri = 'type:predicate';
                    
                    const relationCondition = {
                        some: {
                            ...(relationProjectWhere || {}),
                            predicate: { 
                                uri: { in: [rdfTypeShorthand, rdfTypeFull] } 
                            },
                            object: { uri: predicateClassUri }
                        }
                    };


                    if (filter.isPredicate) {
                        where.subjectRelations = relationCondition;
                    } else {
                        where.subjectRelations = { none: relationCondition };
                    }
                }




                // Date ranges
                if (filter.createdAtStart || filter.createdAtEnd) {
                    where.createdAt = {};
                    if (filter.createdAtStart) where.createdAt.gte = new Date(filter.createdAtStart);
                    if (filter.createdAtEnd) where.createdAt.lte = new Date(filter.createdAtEnd);
                }
                if (filter.updatedAtStart || filter.updatedAtEnd) {
                    where.updatedAt = {};
                    if (filter.updatedAtStart) where.updatedAt.gte = new Date(filter.updatedAtStart);
                    if (filter.updatedAtEnd) where.updatedAt.lte = new Date(filter.updatedAtEnd);
                }

                // Relational intersections (AND logic)
                if (filter.relations && filter.relations.length > 0) {
                    const relationConditions = await Promise.all(filter.relations.map(async (rel: any) => {
                        let subjectId = rel.subjectId;
                        let predicateId = rel.predicateId;
                        let objectId = rel.objectId;
                        const targetUri = rel.isInverted ? (rel.subjectUri || '') : (rel.objectUri || '');

                        // Resolve URIs to IDs if needed
                        if (!subjectId && rel.subjectUri) {
                            const s = await prisma.resource.findFirst({ where: { uri: rel.subjectUri }, select: { id: true } });
                            subjectId = s?.id;
                        }
                        if (!predicateId && rel.predicateUri) {
                            const p = await prisma.resource.findFirst({ where: { uri: rel.predicateUri }, select: { id: true } });
                            predicateId = p?.id;
                        }
                        if (!objectId && rel.objectUri) {
                            const o = await prisma.resource.findFirst({ where: { uri: rel.objectUri }, select: { id: true } });
                            objectId = o?.id;
                        }

                        if (rel.predicateUri === 'prop:status') {
                            if (targetUri === 'status:draft') {
                                return { isPublished: false };
                            }
                            if (targetUri === 'status:published') {
                                return { isPublished: true };
                            }
                        }


                        if (!subjectId && !predicateId && !objectId) return null;

                        // Inbound case: filter by relation subject (current resource becomes object).
                        if (subjectId && !objectId) {
                            const inboundCondition: any = { subjectId, ...(relationProjectWhere || {}) };
                            if (predicateId) inboundCondition.predicateId = predicateId;
                            return { objectRelations: { some: inboundCondition } };
                        }

                        // Default outbound case: current resource is the subject.
                        const outboundCondition: any = { ...(relationProjectWhere || {}) };
                        if (predicateId) outboundCondition.predicateId = predicateId;
                        if (objectId) outboundCondition.objectId = objectId;
                        if (subjectId) outboundCondition.subjectId = subjectId;

                        return { subjectRelations: { some: outboundCondition } };
                    }));

                    const validConditions = relationConditions.filter(Boolean);
                    if (validConditions.length > 0) {
                        where.AND = [...(where.AND || []), ...validConditions];
                    }
                }
            }

            const [items, totalCount] = await Promise.all([
                prisma.resource.findMany({
                    where,
                    skip: skip || 0,
                    take: take || 20,
                    orderBy: { updatedAt: 'desc' },
                }),
                prisma.resource.count({ where }),
            ]);

            return { items, totalCount };
        },

    },

    Mutation: {
        updateResource: async (_parent: any, { id, input }: { id: number; input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const where: any = {
                id,
                ...buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId)
            };

            const existing = await context.prisma.resource.findFirst({ where });
            if (!existing) {
                throw new Error('Resource not found');
            }

            const data: any = {};
            if (input.uri !== undefined) data.uri = input.uri;
            if (input.title !== undefined) data.title = input.title;
            if (input.description !== undefined) data.description = input.description;
            if (input.isPublished !== undefined) data.isPublished = input.isPublished;

            if (Object.keys(data).length === 0) {
                return existing;
            }

            return await context.prisma.resource.update({
                where: { id },
                data,
            });
        },

        upsertResource: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const userId = context.user.id;
            const { uri, title, description, isPublished } = input;

            const targetUri = uri || `resource:${Date.now()}`;

            return await context.prisma.resource.upsert({
                where: { uri: targetUri },
                update: {
                    ...(title !== undefined && { title }),
                    ...(description !== undefined && { description }),
                    ...(isPublished !== undefined && { isPublished }),
                    ...(context.activeProjectId && { projectId: context.activeProjectId }),
                    existent: true,
                    deletedAt: null, // Restore if soft-deleted
                },
                create: {
                    uri: targetUri,
                    title: title || null,
                    description: description || null,
                    isPublished: isPublished || false,
                    userId,
                    projectId: context.activeProjectId || null,
                    existent: true,
                    deletedAt: null,
                },
            });
        },

        scrapeResource: async (_parent: any, { url, resourceUri }: { url: string; resourceUri?: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const result = await executeTool(
                'scrape_resource',
                { url, resourceUri, saveText: true },
                context.prisma,
                context.user.id
            );
            return result.createdItem;
        },


        deleteResource: async (_parent: any, { id }: { id: number }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const where: any = {
                id,
                ...buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId)
            };

            await context.prisma.resource.updateMany({
                where,
                data: { existent: false, deletedAt: new Date() },
            });
            return true;
        },
    },

    // Field resolvers — handles the "Knowledge Space" graph traversal
    Resource: {
        user: async (resource: any, _args: any, context: any) => {
            if (resource.user) return resource.user;
            return await context.prisma.user.findUnique({ where: { id: resource.userId } });
        },
        texts: async (resource: any, _args: any, context: any) => {
            if (resource.texts) return resource.texts;
            return await context.prisma.text.findMany({
                where: { resourceId: resource.id, existent: true },
                orderBy: { createdAt: 'desc' },
            });
        },

        subjectRelations: async (resource: any, _args: any, context: any) => {
            if (resource.subjectRelations) return resource.subjectRelations;
            const where: any = { subjectId: resource.id };
            const relationProjectWhere = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            Object.assign(where, relationProjectWhere);
            return await context.prisma.relation.findMany({
                where,
                include: { predicate: true, object: true }
            });
        },
        objectRelations: async (resource: any, _args: any, context: any) => {
            if (resource.objectRelations) return resource.objectRelations;
            const where: any = { objectId: resource.id };
            const relationProjectWhere = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            Object.assign(where, relationProjectWhere);
            return await context.prisma.relation.findMany({
                where,
                include: { subject: true, predicate: true }
            });
        },
        predicateRelations: async (resource: any, _args: any, context: any) => {
            const where: any = { predicateId: resource.id };
            const relationProjectWhere = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            Object.assign(where, relationProjectWhere);
            return await context.prisma.relation.findMany({
                where,
                include: { subject: true, object: true }
            });
        },
    },
};

