/**
 * resolvers/relations.ts
 *
 * GraphQL resolvers for RDF triple (Relation) management.
 *
 * Queries:
 *   relations — Query triples by subject, predicate, and/or object integer IDs.
 *   relation  — Single Relation by CUID.
 *
 * Mutations:
 *   createRelation — Creates an RDF triple with validation.
 *   deleteRelation — Hard-deletes a Relation.
 *
 * Field Resolvers:
 *   subject, predicate, object (all resolve to Resource via Int FK),
 *   resourceType, response.
 */

export const relationResolvers = {
    Query: {
        relations: async (_parent: any, { subjectId, predicateId, objectId, skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const where: any = {};
            if (subjectId) where.subjectId = subjectId;
            if (predicateId) where.predicateId = predicateId;
            if (objectId) where.objectId = objectId;

            return await context.prisma.relation.findMany({
                where,
                skip: skip || 0,
                take: take || 50,
                orderBy: { createdAt: 'desc' },
                include: {
                    subject: true,
                    predicate: true,
                    object: true,
                    resourceType: true,
                },
            });
        },

        relation: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.relation.findUnique({
                where: { id },
                include: {
                    subject: true,
                    predicate: true,
                    object: true,
                    resourceType: true,
                    response: true,
                },
            });
        },
    },

    Mutation: {
        createRelation: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            // Validate all three resource IDs exist
            const [subject, predicate, object] = await Promise.all([
                context.prisma.resource.findUnique({ where: { id: input.subjectId } }),
                context.prisma.resource.findUnique({ where: { id: input.predicateId } }),
                context.prisma.resource.findUnique({ where: { id: input.objectId } }),
            ]);

            if (!subject) throw new Error(`Subject resource ${input.subjectId} not found`);
            if (!predicate) throw new Error(`Predicate resource ${input.predicateId} not found`);
            if (!object) throw new Error(`Object resource ${input.objectId} not found`);

            return await context.prisma.relation.create({
                data: {
                    uri: input.uri,
                    resourceTypeId: input.resourceTypeId,
                    subjectId: input.subjectId,
                    predicateId: input.predicateId,
                    objectId: input.objectId,
                    literalValue: input.literalValue ?? null,
                    selectionStart: input.selectionStart ?? null,
                    selectionEnd: input.selectionEnd ?? null,
                    justification: input.justification ?? null,
                    responseId: input.responseId ?? null,
                },
                include: {
                    subject: true,
                    predicate: true,
                    object: true,
                    resourceType: true,
                },
            });
        },

        deleteRelation: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            await context.prisma.relation.delete({ where: { id } });
            return true;
        },
    },

    Relation: {
        subject: async (relation: any, _args: any, context: any) => {
            if (relation.subject) return relation.subject;
            return await context.prisma.resource.findUnique({ where: { id: relation.subjectId } });
        },
        predicate: async (relation: any, _args: any, context: any) => {
            if (relation.predicate) return relation.predicate;
            return await context.prisma.resource.findUnique({ where: { id: relation.predicateId } });
        },
        object: async (relation: any, _args: any, context: any) => {
            if (relation.object) return relation.object;
            return await context.prisma.resource.findUnique({ where: { id: relation.objectId } });
        },
        resourceType: async (relation: any, _args: any, context: any) => {
            if (relation.resourceType) return relation.resourceType;
            return await context.prisma.resourceType.findUnique({ where: { id: relation.resourceTypeId } });
        },
        response: async (relation: any, _args: any, context: any) => {
            if (relation.response) return relation.response;
            if (!relation.responseId) return null;
            return await context.prisma.response.findUnique({ where: { id: relation.responseId } });
        },
    },
};
