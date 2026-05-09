/**
 * resolvers/texts.ts
 *
 * GraphQL resolvers for Text CRUD and field resolution.
 *
 * Queries:
 *   texts   — Paginated list, filterable by resourceId and roleId.
 *   text    — Single Text by CUID.
 *
 * Mutations:
 *   createText  — Creates a Text record linked to a Resource.
 *   updateText  — Updates content of an existing Text.
 *
 * Field Resolvers:
 *   role, resource, user.
 */

export const textResolvers = {
    Query: {
        texts: async (_parent: any, { resourceId, roleId, skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const where: any = { userId: context.user.id, existent: true };
            if (resourceId) where.resourceId = resourceId;
            if (roleId) where.roleId = roleId;

            const [items, totalCount] = await Promise.all([
                context.prisma.text.findMany({
                    where,
                    skip: skip || 0,
                    take: take || 20,
                    orderBy: { createdAt: 'desc' },
                    include: { role: true, resource: true },
                }),
                context.prisma.text.count({ where }),
            ]);
            return { items, totalCount };
        },

        text: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.text.findUnique({
                where: { id },
                include: { role: true, resource: true, user: true },
            });
        },
    },

    Mutation: {
        createText: async (_parent: any, { resourceId, content, roleId }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.text.create({
                data: {
                    resourceId,
                    content,
                    roleId,
                    userId: context.user.id,
                },
                include: { role: true, resource: true, user: true },
            });
        },

        updateText: async (_parent: any, { id, content }: { id: string; content: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.text.update({
                where: { id },
                data: { content },
                include: { role: true, resource: true, user: true },
            });
        },
    },

    Text: {
        role: async (text: any, _args: any, context: any) => {
            if (text.role) return text.role;
            return await context.prisma.textRole.findUnique({ where: { id: text.roleId } });
        },
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
