/**
 * resolvers/lookup.ts
 *
 * GraphQL resolvers for lookup table management:
 *   ResourceType, ResourceStatus, TextRole.
 *
 * Queries:
 *   resourceTypes    — All resource type definitions.
 *   resourceStatuses — All resource status definitions.
 *   textRoles        — All text role definitions.
 *
 * Mutations:
 *   createResourceType   — Seed a new ResourceType.
 *   createResourceStatus — Seed a new ResourceStatus.
 *   createTextRole       — Seed a new TextRole.
 */

export const lookupResolvers = {
    Query: {
        resourceTypes: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.resourceType.findMany({
                orderBy: { id: 'asc' },
            });
        },

        resourceStatuses: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.resourceStatus.findMany({
                orderBy: { id: 'asc' },
            });
        },

        textRoles: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.textRole.findMany({
                orderBy: { id: 'asc' },
            });
        },
    },

    Mutation: {
        createResourceType: async (_parent: any, { name }: { name: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.resourceType.create({
                data: { name },
            });
        },

        createResourceStatus: async (_parent: any, { name }: { name: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.resourceStatus.create({
                data: { name },
            });
        },

        createTextRole: async (_parent: any, { name }: { name: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.textRole.create({
                data: { name },
            });
        },
    },
};
