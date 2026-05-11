import { PrismaClient } from '@prisma/client';

export const resourceResolvers = {
    Query: {
        resource: async (_parent: any, { id }: { id: number }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.resource.findUnique({
                where: { id, userId: context.user.id }, // Security: enforce ownership
                include: {
                    texts: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
                    subjectRelations: { include: { predicate: true, object: true } },
                    objectRelations: { include: { subject: true, predicate: true } },
                }
            });
        },

        resourceByUri: async (_parent: any, { uri }: { uri: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.resource.findUnique({
                where: { userId_uri: { userId: context.user.id, uri } },
                include: {
                    texts: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
                    subjectRelations: { include: { predicate: true, object: true } },
                    objectRelations: { include: { subject: true, predicate: true } },
                }
            });
        },

        resources: async (_parent: any, { search, skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const where: any = { userId: context.user.id, deletedAt: null };

            if (search) {
                where.OR = [
                    { title: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                    { uri: { contains: search, mode: 'insensitive' } },
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
            const userId = context.user.id;

            const where: any = { userId, deletedAt: null };

            if (filter) {
                if (filter.uriContains) where.uri = { contains: filter.uriContains, mode: 'insensitive' };
                if (filter.titleContains) where.title = { contains: filter.titleContains, mode: 'insensitive' };
                if (filter.resourceTypeId) where.resourceTypeId = filter.resourceTypeId;
                if (filter.statusId) where.statusId = filter.statusId;

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
                        let predicateId = rel.predicateId;
                        let objectId = rel.objectId;

                        // Resolve URIs to IDs if needed
                        if (!predicateId && rel.predicateUri) {
                            const p = await prisma.resource.findFirst({ where: { uri: rel.predicateUri, userId }, select: { id: true } });
                            predicateId = p?.id;
                        }
                        if (!objectId && rel.objectUri) {
                            const o = await prisma.resource.findFirst({ where: { uri: rel.objectUri, userId }, select: { id: true } });
                            objectId = o?.id;
                        }

                        if (!predicateId && !objectId) return null;

                        const condition: any = {};
                        if (predicateId) condition.predicateId = predicateId;
                        if (objectId) condition.objectId = objectId;

                        return { subjectRelations: { some: condition } };
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
        upsertResource: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const userId = context.user.id;
            const { uri, title, description, notation, isPublished } = input;

            return await context.prisma.resource.upsert({
                where: { userId_uri: { userId, uri: uri || `resource:${Date.now()}` } },
                update: {
                    ...(title !== undefined && { title }),
                    ...(description !== undefined && { description }),
                    ...(notation !== undefined && { notation }),
                    ...(isPublished !== undefined && { isPublished }),
                    deletedAt: null, // Restore if soft-deleted
                },
                create: {
                    uri: uri || `resource:${Date.now()}`,
                    title: title || null,
                    description: description || null,
                    notation: notation || null,
                    isPublished: isPublished || false,
                    userId,
                    deletedAt: null,
                },
            });
        },

        deleteResource: async (_parent: any, { id }: { id: number }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            await context.prisma.resource.update({
                where: { id, userId: context.user.id },
                data: { deletedAt: new Date() },
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
                where: { resourceId: resource.id, deletedAt: null },
                orderBy: { createdAt: 'desc' },
            });
        },
        subjectRelations: async (resource: any, _args: any, context: any) => {
            if (resource.subjectRelations) return resource.subjectRelations;
            return await context.prisma.relation.findMany({
                where: { subjectId: resource.id },
                include: { predicate: true, object: true }
            });
        },
        objectRelations: async (resource: any, _args: any, context: any) => {
            if (resource.objectRelations) return resource.objectRelations;
            return await context.prisma.relation.findMany({
                where: { objectId: resource.id },
                include: { subject: true, predicate: true }
            });
        },
        predicateRelations: async (resource: any, _args: any, context: any) => {
            return await context.prisma.relation.findMany({
                where: { predicateId: resource.id },
                include: { subject: true, object: true }
            });
        },
    },
};

