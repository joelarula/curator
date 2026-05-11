/**
 * resolvers/texts.ts
 *
 * GraphQL resolvers for Text CRUD and field resolution.
 *
 * Queries:
 *   texts   — Paginated list, filterable by resourceId and role.
 *   text    — Single Text by CUID.
 *
 * Mutations:
 *   createText  — Creates a Text record linked to a Resource.
 *   updateText  — Updates content of an existing Text.
 *
 * Field Resolvers:
 *   resource, user.
 */

export const textResolvers = {
    Query: {
        texts: async (_parent: any, { resourceId, role, skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const where: any = { userId: context.user.id, deletedAt: null };
            if (resourceId) where.resourceId = resourceId;
            if (role) where.role = role;

            const [items, totalCount] = await Promise.all([
                context.prisma.text.findMany({
                    where,
                    skip: skip || 0,
                    take: take || 20,
                    orderBy: { createdAt: 'desc' },
                    include: { resource: true },
                }),
                context.prisma.text.count({ where }),
            ]);
            return { items, totalCount };
        },

        text: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.text.findUnique({
                where: { id },
                include: { resource: true, user: true },
            });
        },
    },

    Mutation: {
        createText: async (_parent: any, { resourceId, content, role }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.text.create({
                data: {
                    resourceId,
                    content,
                    role: role || 'MAIN',
                    userId: context.user.id,
                },
                include: { resource: true, user: true },
            });
        },

        updateText: async (_parent: any, { id, content }: { id: string; content: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.text.update({
                where: { id },
                data: { content },
                include: { resource: true, user: true },
            });
        },
    },

    Text: {
        resource: async (text: any, _args: any, context: any) => {
            if (text.resource) return text.resource;
            if (!text.resourceId) return null;
            return await context.prisma.resource.findUnique({ where: { id: text.resourceId } });
        },
        user: async (text: any, _args: any, context: any) => {
            if (text.user) return text.user;
            return await context.prisma.user.findUnique({ where: { id: text.userId } });
        },
    },
};
