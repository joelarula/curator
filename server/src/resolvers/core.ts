/**
 * resolvers/core.ts
 *
 * Core GraphQL resolvers for the identity-centric wiki data model.
 * Covers: Source, Text, Relation, Tag, and the Wiki tree.
 *
 * Queries:
 *   me              — Returns the authenticated user from context.
 *   wikiPage        — Fetches a single Source by its materializedPath slug.
 *   wikiTree        — Returns direct children of a given parentId (lazy tree loading).
 *   source / sources— Single-source lookup and paginated/filterable source list.
 *   texts / text    — Paginated text list and single text with full relations.
 *   tags            — System-wide tag list.
 *   sourcesReview   — Paginated list of NEW sources for the inbox review flow.
 *
 * Mutations:
 *   saveWikiPage    — Create or update a Source + Text via WikiService.
 *   deleteWikiPage  — Hard-deletes a Source.
 *   addRelation / removeRelation — Manages directional semantic links between Sources.
 *   addTag / removeTag           — Attaches/detaches tags from Source or Text.
 *   removeSource    — Soft-deletes a Source (sets existent: null).
 *   toggleFeed      — Enables or disables a feed's automated polling.
 *   updateFeed      — Updates feed metadata including the AI prompt.
 *
 * Field Resolvers:
 *   Source: parent, children, texts, outboundRelations, inboundRelations,
 *           tags, ancestors (derived from materializedPath), descendants, _count.
 *   Text:   originSource, reports, tags.
 *   Relation: fromSource, toSource.
 */
// Resolvers for Identity-Centric Wiki models: Source, Text, Relation, Tag
import { WikiService } from '../services/WikiService.js';

export const coreResolvers = {
    Query: {
        me: (_parent: any, _args: any, context: any) => context.user,

        // --- WIKI CORE ---
        wikiPage: async (_parent: any, { path }: { path: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            // Path logic is lowercase/slugified in the DB
            const slugifiedPath = path.split('/').map((s: string) => s.toLowerCase().trim().replace(/\s+/g, '-')).join('/');
            return await context.prisma.source.findUnique({
                where: { 
                    materializedPath: slugifiedPath,
                    existent: true 
                },
                include: {
                    texts: { orderBy: { createdAt: 'desc' }, take: 1 }, // Latest text by default
                    tags: true
                }
            });
        },

        wikiTree: async (_parent: any, { parentId }: { parentId?: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.wiki.getChildren(parentId || null);
        },

        source: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.source.findUnique({
                where: { id },
                include: {
                    texts: { orderBy: { createdAt: 'desc' } },
                    tags: true,
                    outboundRelations: true,
                    inboundRelations: true
                }
            });
        },

        sources: async (_parent: any, { filter, skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const where: any = { userId: context.user.id };

            if (filter?.search) {
                where.OR = [
                    { title: { contains: filter.search, mode: 'insensitive' } },
                    { description: { contains: filter.search, mode: 'insensitive' } },
                    { path: { contains: filter.search, mode: 'insensitive' } },
                    { materializedPath: { contains: filter.search, mode: 'insensitive' } }
                ];
            }

            if (filter?.isPublished !== undefined) {
                where.isPublished = filter.isPublished;
            }

            if (filter?.startDate || filter?.endDate) {
                where.createdAt = {};
                if (filter.startDate) where.createdAt.gte = new Date(filter.startDate);
                if (filter.endDate) where.createdAt.lte = new Date(filter.endDate);
            }

            if (filter?.tags && filter.tags.length > 0) {
                where.tags = {
                    some: {
                        OR: filter.tags.map((t: any) => ({
                            name: t.name,
                            value: t.value || null
                        }))
                    }
                };
            }

            const [items, totalCount] = await Promise.all([
                context.prisma.source.findMany({
                    where,
                    skip: skip || 0,
                    take: take || 20,
                    orderBy: { updatedAt: 'desc' },
                    include: { tags: true }
                }),
                context.prisma.source.count({ where })
            ]);

            return { items, totalCount };
        },

        // --- CONTENT & TAGS ---
        texts: async (_parent: any, { filter, skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const where: any = { userId: context.user.id };

            if (filter?.search) {
                where.content = { contains: filter.search, mode: 'insensitive' };
            }

            if (filter?.startDate || filter?.endDate) {
                where.createdAt = {};
                if (filter.startDate) where.createdAt.gte = new Date(filter.startDate);
                if (filter.endDate) where.createdAt.lte = new Date(filter.endDate);
            }

            if (filter?.isPublished !== undefined) {
                where.isPublished = filter.isPublished;
            }

            if (filter?.tags && filter.tags.length > 0) {
                where.tags = {
                    some: {
                        OR: filter.tags.map((t: any) => ({
                            name: t.name,
                            value: t.value || null
                        }))
                    }
                };
            }

            const [items, totalCount] = await Promise.all([
                context.prisma.text.findMany({
                    where,
                    skip: skip || 0,
                    take: take || 20,
                    orderBy: { createdAt: 'desc' },
                    include: { originSource: true, tags: true }
                }),
                context.prisma.text.count({ where })
            ]);
            return { items, totalCount };
        },

        text: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.text.findUnique({
                where: { id, userId: context.user.id },
                include: {
                    originSource: true,
                    tags: true,
                    children: true,
                    reports: true,
                    asAncestor: true,
                    asDescendant: true
                }
            });
        },

        tags: async (_parent: any, _args: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.tag.findMany(); // System-wide tags for now
        },

        sourcesReview: async (_parent: any, { status, skip, take }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const where: any = status ? { status } : { status: 'NEW' };
            where.existent = true; // Only show active items for review
            
            const [items, totalCount] = await Promise.all([
                context.prisma.source.findMany({
                    where,
                    skip: skip || 0,
                    take: take || 20,
                    orderBy: { createdAt: 'desc' }
                }),
                context.prisma.source.count({ where })
            ]);
            return { items, totalCount };
        }
    },

    Mutation: {
        // --- WIKI OPERATIONS ---
        saveWikiPage: async (_parent: any, { input }: { input: any }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            const { sourceId } = await context.wiki.savePage(context.user.id, input);
            return await context.prisma.source.findUnique({
                where: { id: sourceId },
                include: { 
                    parent: true,
                    texts: { take: 1, orderBy: { createdAt: 'desc' } } 
                }
            });
        },

        deleteWikiPage: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            await context.prisma.source.delete({ where: { id } });
            return true;
        },

        // --- SEMANTIC RELATIONS ---
        addRelation: async (_parent: any, { fromSourceId, toSourceId, role, metadata }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.relation.create({
                data: {
                    fromSourceId,
                    toSourceId,
                    role,
                    metadata: metadata ? JSON.parse(metadata) : null
                },
                include: { fromSource: true, toSource: true }
            });
        },

        removeRelation: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            await context.prisma.relation.delete({ where: { id } });
            return true;
        },

        // --- SUPPORT ---
        addTag: async (_parent: any, { targetId, targetType, input }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            const tag = await context.prisma.tag.upsert({
                where: { name_value: { name: input.name, value: input.value || null } },
                create: { name: input.name, value: input.value || null },
                update: {}
            });

            if (targetType === 'TEXT') {
                await context.prisma.text.update({
                    where: { id: targetId },
                    data: { tags: { connect: { id: tag.id } } }
                });
            } else if (targetType === 'SOURCE') {
                await context.prisma.source.update({
                    where: { id: targetId },
                    data: { tags: { connect: { id: tag.id } } }
                });
            }

            return tag;
        },

        removeTag: async (_parent: any, { tagId, targetId, targetType }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');

            if (targetType === 'TEXT') {
                await context.prisma.text.update({
                    where: { id: targetId },
                    data: { tags: { disconnect: { id: tagId } } }
                });
            } else if (targetType === 'SOURCE') {
                await context.prisma.source.update({
                    where: { id: targetId },
                    data: { tags: { disconnect: { id: tagId } } }
                });
            }

            return true;
        },

        removeSource: async (_parent: any, { id }: { id: string }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.source.update({
                where: { id },
                data: { existent: null }
            });
        },

        toggleFeed: async (_parent: any, { id, enabled }: { id: string, enabled: boolean }, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.feed.update({
                where: { id },
                data: { enabled }
            });
        },

        updateFeed: async (_parent: any, { id, url, name, pollingPeriod, defaultTagName, defaultTagValue, aiPrompt }: any, context: any) => {
            if (!context.user) throw new Error('Unauthorized');
            return await context.prisma.feed.update({
                where: { id },
                data: { 
                    ...(url && { url }),
                    ...(name && { name }),
                    ...(pollingPeriod && { pollingPeriod }),
                    ...(defaultTagName !== undefined && { defaultTagName }),
                    ...(defaultTagValue !== undefined && { defaultTagValue }),
                    ...(aiPrompt !== undefined && { aiPrompt })
                }
            });
        },
    },

    // --- FIELD RESOLVERS ---
    Source: {
        parent: async (source: any, _args: any, context: any) => {
            if (!source.parentId) return null;
            return await context.prisma.source.findUnique({ where: { id: source.parentId } });
        },
        children: async (source: any, _args: any, context: any) => {
            return await context.prisma.source.findMany({ where: { parentId: source.id } });
        },
        texts: async (source: any, { skip, take }: any, context: any) => {
            return await context.prisma.text.findMany({
                where: { originSourceId: source.id },
                skip: skip || 0,
                take: take || undefined,
                orderBy: { createdAt: 'desc' }
            });
        },
        outboundRelations: async (source: any, _args: any, context: any) => {
            return await context.prisma.relation.findMany({ where: { fromSourceId: source.id } });
        },
        inboundRelations: async (source: any, _args: any, context: any) => {
            return await context.prisma.relation.findMany({ where: { toSourceId: source.id } });
        },
        tags: async (source: any, _args: any, context: any) => {
            return await context.prisma.tag.findMany({ where: { sources: { some: { id: source.id } } } });
        },
        ancestors: async (source: any, _args: any, context: any) => {
            if (!source.materializedPath) return [];
            const segments = source.materializedPath.split('/');
            const paths: string[] = [];
            let current = '';
            for (let i = 0; i < segments.length - 1; i++) {
                current = current ? `${current}/${segments[i]}` : segments[i];
                paths.push(current);
            }
            return await context.prisma.source.findMany({
                where: { materializedPath: { in: paths } },
                orderBy: { depth: 'asc' }
            });
        },
        descendants: async (source: any, _args: any, context: any) => {
            if (!source.materializedPath) return [];
            return await context.prisma.source.findMany({
                where: { materializedPath: { startsWith: `${source.materializedPath}/` } },
                orderBy: { depth: 'asc' }
            });
        },
        _count: async (source: any, _args: any, context: any) => {
            if (source._count) return source._count;
            const res = await context.prisma.source.findUnique({
                where: { id: source.id },
                select: { _count: { select: { children: true, texts: true } } }
            });
            return res?._count;
        }
    },

    Text: {
        originSource: async (text: any, _args: any, context: any) => {
            return await context.prisma.source.findUnique({ where: { id: text.originSourceId } });
        },
        reports: async (text: any, _args: any, context: any) => {
            return await context.prisma.report.findMany({
                where: { texts: { some: { id: text.id } } }
            });
        },
        tags: async (text: any, _args: any, context: any) => {
            return await context.prisma.tag.findMany({ where: { texts: { some: { id: text.id } } } });
        }
    },

    Relation: {
        fromSource: async (relation: any, _args: any, context: any) => {
            return await context.prisma.source.findUnique({ where: { id: relation.fromSourceId } });
        },
        toSource: async (relation: any, _args: any, context: any) => {
            return await context.prisma.source.findUnique({ where: { id: relation.toSourceId } });
        }
    }
};
