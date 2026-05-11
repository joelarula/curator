/**
 * resolvers/udc.ts
 *
 * GraphQL resolvers for the isolated UDC Taxonomy Lookup table.
 *
 * Queries:
 *   udcCategoryByUri — Single category lookup.
 *   udcCategories    — Paginated, filterable lookup.
 *   udcSubtree       — Hierarchical subtree traversal.
 */

export const udcResolvers = {
    Query: {
        udcCategoryByUri: async (_parent: any, { uri }: { uri: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.udcLookup.findUnique({
                where: { uri },
            });
        },

        udcCategories: async (_parent: any, { search, skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const where: any = {};
            if (search) {
                where.OR = [
                    { title: { contains: search, mode: 'insensitive' } },
                    { notation: { contains: search, mode: 'insensitive' } },
                    { enLabel: { contains: search, mode: 'insensitive' } },
                    { etLabel: { contains: search, mode: 'insensitive' } },
                ];
            }

            return await context.prisma.udcLookup.findMany({
                where,
                skip: skip || 0,
                take: take || 20,
                orderBy: { treeStart: 'asc' },
            });
        },

        udcSubtree: async (_parent: any, { parentUri, depth }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            // 1. Get the parent bound
            const parent = await context.prisma.udcLookup.findUnique({
                where: { uri: parentUri },
            });

            if (!parent) return [];

            // 2. Find all categories within the nested set bounds
            const where: any = {
                treeStart: { gte: parent.treeStart },
                treeEnd: { lte: parent.treeEnd },
            };

            if (depth !== undefined) {
                where.depth = { lte: parent.depth + depth };
            }

            return await context.prisma.udcLookup.findMany({
                where,
                orderBy: { treeStart: 'asc' },
            });
        },
    },
};
