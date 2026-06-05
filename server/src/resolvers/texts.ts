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

            const where: any = { existent: true };

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

        textRoles: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            // Plain findMany (no distinct) + JS Set dedup avoids both Prisma's
            // multi-query distinct machinery and $queryRawUnsafe's raw serializer.
            const texts = await context.prisma.text.findMany({
                where: { existent: true },
                select: { role: true },
            });
            const roles = texts.map((t: any) => t.role as string);
            const defaults = ['MAIN', 'SUMMARY', 'TRANSCRIPT', 'HTML'];
            return Array.from(new Set([...defaults, ...roles])).sort();
        },
    },

    Mutation: {
        createText: async (_parent: any, { resourceId, content, role }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const targetRole = role || 'MAIN';
            
            // Check if text with same resourceId and role already exists (active or soft-deleted)
            const existing = await context.prisma.text.findFirst({
                where: { resourceId, role: targetRole }
            });

            if (existing) {
                if (existing.existent) {
                    throw new Error(`Text section with role "${targetRole}" already exists for this resource.`);
                } else {
                    // Restore the soft-deleted text section and update its content
                    return await context.prisma.text.update({
                        where: { id: existing.id },
                        data: { existent: true, deletedAt: null, content: content || "" },
                        include: { resource: true }
                    });
                }
            }

            return await context.prisma.text.create({
                data: {
                    resourceId,
                    content,
                    role: targetRole,
                    userId: context.user.id,
                },
                include: { resource: true },
            });
        },

        updateText: async (_parent: any, { id, content }: { id: string; content: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.text.update({
                where: { id },
                data: { content },
                include: { resource: true },
            });
        },

        deleteText: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            await context.prisma.text.update({
                where: { id },
                data: { existent: false, deletedAt: new Date() },
            });
            return true;
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
