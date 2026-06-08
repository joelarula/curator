import { PREDICATE_REGISTRY, upsertPredicate } from '../services/PredicateService.js';
import { VOCAB } from '../constants/vocabulary.js';
import { buildProjectScopeWhere } from '../services/ProjectScopeService.js';

export const predicateResolvers = {
    Query: {
        predicateRegistry: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return PREDICATE_REGISTRY;
        },

        predicates: async (_parent: any, { skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            // A resource is a predicate if it has an rdf:type -> type:predicate relation.
            const where = {
                existent: true,
                ...scope,
                subjectRelations: {
                    some: {
                        ...scope,
                        predicate: { uri: VOCAB.RDF.type },
                        object: { uri: VOCAB.TYPE.predicate }
                    }
                }
            };

            const [items, totalCount] = await Promise.all([
                context.prisma.resource.findMany({
                    where,
                    skip: skip || 0,
                    take: take || 20,
                    orderBy: { updatedAt: 'desc' }
                }),
                context.prisma.resource.count({ where })
            ]);

            return { items, totalCount };
        }
    },

    Mutation: {
        upsertPredicate: async (_parent: any, { uri, title, description, allowedValues }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            // 1. Call upsertPredicate helper
            const predicate = await upsertPredicate(context.prisma, context.user.id, {
                uri,
                title,
                description,
                projectId: context.activeProjectId || null
            });

            // 2. If allowed values are provided, register them via allowsValue
            if (allowedValues && allowedValues.length > 0) {
                const allowsValueResource = await context.prisma.resource.upsert({
                    where: { uri: VOCAB.PROP.allowsValue },
                    update: { existent: true, deletedAt: null },
                    create: {
                        uri: VOCAB.PROP.allowsValue,
                        title: 'prop:allows_value',
                        userId: context.user.id,
                        projectId: context.activeProjectId || null,
                        isPublished: false,
                        existent: true,
                        deletedAt: null
                    }
                });

                for (const valUri of allowedValues) {
                    const allowedValueResource = await context.prisma.resource.upsert({
                        where: { uri: valUri },
                        update: { existent: true, deletedAt: null },
                        create: {
                            uri: valUri,
                            title: valUri.substring(0, 250),
                            userId: context.user.id,
                            projectId: context.activeProjectId || null,
                            isPublished: false,
                            existent: true,
                            deletedAt: null
                        }
                    });

                    await context.prisma.relation.upsert({
                        where: {
                            subjectId_predicateId_objectId: {
                                subjectId: predicate.id,
                                predicateId: allowsValueResource.id,
                                objectId: allowedValueResource.id
                            }
                        },
                        update: { existent: true },
                        create: {
                            subjectId: predicate.id,
                            predicateId: allowsValueResource.id,
                            objectId: allowedValueResource.id,
                            projectId: context.activeProjectId || null,
                            existent: true
                        }
                    });

                    // Link allowed value back to predicate via rdf:type (Inbound / Both Ways)
                    const typePredicate = await context.prisma.resource.upsert({
                        where: { uri: VOCAB.RDF.type },
                        update: { existent: true, deletedAt: null },
                        create: {
                            uri: VOCAB.RDF.type,
                            title: 'rdf:type',
                            userId: context.user.id,
                            projectId: context.activeProjectId || null,
                            isPublished: false,
                            existent: true,
                            deletedAt: null
                        }
                    });

                    await context.prisma.relation.upsert({
                        where: {
                            subjectId_predicateId_objectId: {
                                subjectId: allowedValueResource.id,
                                predicateId: typePredicate.id,
                                objectId: predicate.id
                            }
                        },
                        update: { existent: true },
                        create: {
                            subjectId: allowedValueResource.id,
                            predicateId: typePredicate.id,
                            objectId: predicate.id,
                            projectId: context.activeProjectId || null,
                            existent: true
                        }
                    });
                }
            }

            return predicate;
        }
    },

    PredicateDefinition: {
        allowedValues: async (parent: any, _args: any, context: any) => {
            if (!parent.allowedValues || parent.allowedValues.length === 0) {
                return [];
            }
            // Resolve the URIs to database Resources
            const scope = buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId);
            return await context.prisma.resource.findMany({
                where: {
                    uri: { in: parent.allowedValues },
                    existent: true,
                    ...scope
                }
            });
        }
    }
};
