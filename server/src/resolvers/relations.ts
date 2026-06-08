/**
 * resolvers/relations.ts
 *
 * GraphQL resolvers for RDF triple (Relation) management.
 *
 * Queries:
 *   relations — Query triples by subject, predicate, and/or object integer IDs.
 *   relation  — Single Relation by ID.
 *
 * Mutations:
 *   createRelation — Creates an RDF triple with validation.
 *   deleteRelation — Hard-deletes a Relation.
 *
 * Field Resolvers:
 *   subject, predicate, object (all resolve to Resource via Int FK),
 *   aiModel.
 */
import { PrismaClient } from '@prisma/client';
import { buildProjectScopeWhere } from '../services/ProjectScopeService.js';

export const relationResolvers = {
    Query: {
        relations: async (_parent: any, { subjectId, predicateId, objectId, skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const where: any = {};
            if (subjectId) where.subjectId = subjectId;
            if (predicateId) where.predicateId = predicateId;
            if (objectId) where.objectId = objectId;
            const relationProjectWhere = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            Object.assign(where, relationProjectWhere);

            return await context.prisma.relation.findMany({
                where,
                skip: skip || 0,
                take: take || 50,
                orderBy: { createdAt: 'desc' },
                include: {
                    subject: true,
                    predicate: true,
                    object: true,
                    aiModel: true,
                },
            });
        },

        relation: async (_parent: any, { id }: { id: number }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const where: any = { id };
            const relationProjectWhere = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            Object.assign(where, relationProjectWhere);

            return await context.prisma.relation.findFirst({
                where,
                include: {
                    subject: true,
                    predicate: true,
                    object: true,
                    aiModel: true,
                },
            });
        },
    },

    Mutation: {
        createRelation: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            // Validate all three resource IDs exist and are in the allowed project scopes
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            const [subject, predicate, object] = await Promise.all([
                context.prisma.resource.findFirst({ where: { id: input.subjectId, ...scope } }),
                context.prisma.resource.findFirst({ where: { id: input.predicateId, ...scope } }),
                context.prisma.resource.findFirst({ where: { id: input.objectId, ...scope } }),
            ]);

            if (!subject) throw new Error(`Subject resource ${input.subjectId} not found`);
            if (!predicate) throw new Error(`Predicate resource ${input.predicateId} not found`);
            if (!object) throw new Error(`Object resource ${input.objectId} not found`);

            return await context.prisma.relation.create({
                data: {
                    subjectId: input.subjectId,
                    predicateId: input.predicateId,
                    objectId: input.objectId,
                    literalValue: input.literalValue ?? null,
                    selectionStart: input.selectionStart ?? null,
                    selectionEnd: input.selectionEnd ?? null,
                    projectId: context.activeProjectId || null,
                    justification: input.justification ?? null,
                    aiModelId: input.aiModelId ? parseInt(input.aiModelId as string) : null,
                },
                include: {
                    subject: true,
                    predicate: true,
                    object: true,
                    aiModel: true,
                },
            });
        },

        deleteRelation: async (_parent: any, { id }: { id: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const numericId = typeof id === 'number' ? id : parseInt(id, 10);
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            const relation = await context.prisma.relation.findFirst({
                where: { id: numericId, ...scope }
            });
            if (!relation) throw new Error('Relation not found or outside active project scope');
            await context.prisma.relation.delete({ where: { id: numericId } });
            return true;
        },
        upsertRelation: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const { upsertRelation } = await import('../services/tools/upsertRelation.js');
            const result = await upsertRelation(input, context.prisma, context.user.id, {
                projectId: context.activeProjectId || null,
            });
            if (!result.success) throw new Error('upsertRelation failed');
            return result.data;
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
        aiModel: async (relation: any, _args: any, context: any) => {
            if (relation.aiModel) return relation.aiModel;
            if (!relation.aiModelId) return null;
            return await context.prisma.aIModel.findUnique({ where: { id: relation.aiModelId } });
        },
    },
};
