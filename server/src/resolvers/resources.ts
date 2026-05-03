/**
 * resolvers/resources.ts
 *
 * GraphQL resolvers for Resource CRUD and field resolution.
 *
 * Queries:
 *   resource(id)     — Fetch by integer ID with full includes.
 *   resourceByUri    — Fetch by unique URI string.
 *   resources        — Paginated, filterable list for the current user.
 *
 * Mutations:
 *   createResource   — Creates a new Resource with the given input.
 *   updateResource   — Updates an existing Resource by integer ID.
 *   deleteResource   — Soft-deletes (sets existent: null).
 *
 * Field Resolvers:
 *   status, resourceType, user, texts, attachments,
 *   subjectRelations, predicateRelations, objectRelations, prompts.
 */

export const resourceResolvers = {
    Query: {
        resource: async (_parent: any, { id }: { id: number }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.resource.findUnique({
                where: { id },
                include: {
                    status: true,
                    resourceType: true,
                    user: true,
                    texts: { orderBy: { createdAt: 'desc' } },
                    attachments: true,
                }
            });
        },

        resourceByUri: async (_parent: any, { uri }: { uri: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.resource.findUnique({
                where: { uri },
                include: {
                    status: true,
                    resourceType: true,
                    user: true,
                    texts: { orderBy: { createdAt: 'desc' } },
                    attachments: true,
                }
            });
        },

        resources: async (_parent: any, { typeId, statusId, search, skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const where: any = { userId: context.user.id, existent: true };

            if (typeId) where.resourceTypeId = typeId;
            if (statusId) where.statusId = statusId;

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
                    include: { status: true, resourceType: true },
                }),
                context.prisma.resource.count({ where }),
            ]);

            return { items, totalCount };
        },
    },

    Mutation: {
        createResource: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            if (!input.uri) throw new Error('URI is required');

            return await context.prisma.resource.create({
                data: {
                    uri: input.uri,
                    url: input.url || null,
                    title: input.title || null,
                    description: input.description || null,
                    resourceTypeId: input.resourceTypeId || null,
                    statusId: input.statusId || null,
                    isPublished: input.isPublished || false,
                    userId: context.user.id,
                },
                include: { status: true, resourceType: true, user: true },
            });
        },

        updateResource: async (_parent: any, { id, input }: { id: number; input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const data: any = {};
            if (input.uri !== undefined) data.uri = input.uri;
            if (input.url !== undefined) data.url = input.url;
            if (input.title !== undefined) data.title = input.title;
            if (input.description !== undefined) data.description = input.description;
            if (input.resourceTypeId !== undefined) data.resourceTypeId = input.resourceTypeId;
            if (input.statusId !== undefined) data.statusId = input.statusId;
            if (input.isPublished !== undefined) data.isPublished = input.isPublished;

            return await context.prisma.resource.update({
                where: { id },
                data,
                include: { status: true, resourceType: true, user: true },
            });
        },

        deleteResource: async (_parent: any, { id }: { id: number }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            await context.prisma.resource.update({
                where: { id },
                data: { existent: null },
            });
            return true;
        },
    },

    // Field resolvers — lazy-load relations not included in the query
    Resource: {
        status: async (resource: any, _args: any, context: any) => {
            if (resource.status) return resource.status;
            if (!resource.statusId) return null;
            return await context.prisma.resourceStatus.findUnique({ where: { id: resource.statusId } });
        },
        resourceType: async (resource: any, _args: any, context: any) => {
            if (resource.resourceType) return resource.resourceType;
            if (!resource.resourceTypeId) return null;
            return await context.prisma.resourceType.findUnique({ where: { id: resource.resourceTypeId } });
        },
        user: async (resource: any, _args: any, context: any) => {
            if (resource.user) return resource.user;
            return await context.prisma.user.findUnique({ where: { id: resource.userId } });
        },
        texts: async (resource: any, _args: any, context: any) => {
            if (resource.texts) return resource.texts;
            return await context.prisma.text.findMany({
                where: { resourceId: resource.id },
                orderBy: { createdAt: 'desc' },
            });
        },
        attachments: async (resource: any, _args: any, context: any) => {
            if (resource.attachments) return resource.attachments;
            return await context.prisma.attachment.findMany({
                where: { resourceId: resource.id },
            });
        },
        subjectRelations: async (resource: any, _args: any, context: any) => {
            return await context.prisma.relation.findMany({
                where: { subjectId: resource.id },
            });
        },
        predicateRelations: async (resource: any, _args: any, context: any) => {
            return await context.prisma.relation.findMany({
                where: { predicateId: resource.id },
            });
        },
        objectRelations: async (resource: any, _args: any, context: any) => {
            return await context.prisma.relation.findMany({
                where: { objectId: resource.id },
            });
        },
        prompts: async (resource: any, _args: any, context: any) => {
            if (resource.prompts) return resource.prompts;
            return await context.prisma.prompt.findMany({
                where: { resources: { some: { id: resource.id } } },
            });
        },
    },
};
