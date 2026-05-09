import { PrismaClient } from '@prisma/client';

export const graphResolvers = {
    Query: {
        knowledgeGraph: async (_parent: any, { rootResourceId, depth = 1 }: { rootResourceId?: number, depth?: number }, { prisma }: { prisma: PrismaClient }) => {
            const nodesMap = new Map<number, any>();
            const links: any[] = [];

            // If no root, fetch a subset of resources to show a global view
            const startResources = rootResourceId 
                ? await prisma.resource.findMany({ where: { id: rootResourceId }, include: { resourceType: true } })
                : await prisma.resource.findMany({ take: 100, include: { resourceType: true } });

            for (const res of startResources) {
                nodesMap.set(res.id, {
                    id: res.id,
                    title: res.title || res.uri,
                    type: res.resourceType?.name,
                    val: 1
                });
            }

            // Simple traversal (BFS-like based on depth)
            // For now, let's just fetch all relations for these resources
            const resourceIds = Array.from(nodesMap.keys());
            
            const relations = await prisma.relation.findMany({
                where: {
                    OR: [
                        { subjectId: { in: resourceIds } },
                        { objectId: { in: resourceIds } }
                    ]
                },
                include: {
                    subject: { include: { resourceType: true } },
                    object: { include: { resourceType: true } },
                    predicate: true
                }
            });

            for (const rel of relations) {
                // Ensure nodes are in the map
                if (!nodesMap.has(rel.subjectId)) {
                    nodesMap.set(rel.subjectId, {
                        id: rel.subjectId,
                        title: rel.subject.title || rel.subject.uri,
                        type: rel.subject.resourceType?.name,
                        val: 1
                    });
                }
                if (!nodesMap.has(rel.objectId)) {
                    nodesMap.set(rel.objectId, {
                        id: rel.objectId,
                        title: rel.object.title || rel.object.uri,
                        type: rel.object.resourceType?.name,
                        val: 1
                    });
                }

                links.push({
                    source: rel.subjectId,
                    target: rel.objectId,
                    label: rel.predicate.title || rel.predicate.uri
                });

                // Update node weights based on connections
                const s = nodesMap.get(rel.subjectId);
                const o = nodesMap.get(rel.objectId);
                if (s) s.val = (s.val || 1) + 1;
                if (o) o.val = (o.val || 1) + 1;
            }

            return {
                nodes: Array.from(nodesMap.values()),
                edges: links // Renaming links to edges for schema compliance
            };
        },

        /**
         * Fetch a specific resource tree (e.g. 'UDC').
         */
        resourceTree: async (
            _parent: any,
            { treeName, rootResourceId }: { treeName: string, rootResourceId?: number },
            { prisma }: { prisma: PrismaClient }
        ) => {
            if (rootResourceId) {
                // Fetch specific branch using nested set logic if available
                const rootNode = await prisma.resourceTree.findUnique({
                    where: { treeName_resourceId: { treeName, resourceId: rootResourceId } }
                });
                
                if (!rootNode) return [];

                return prisma.resourceTree.findMany({
                    where: {
                        treeName,
                        treeStart: { gte: rootNode.treeStart },
                        treeEnd: { lte: rootNode.treeEnd }
                    },
                    include: { resource: true },
                    orderBy: { treeStart: 'asc' }
                });
            } else {
                // Fetch top-level nodes
                return prisma.resourceTree.findMany({
                    where: { treeName, depth: 0 },
                    include: { resource: true },
                    orderBy: { treeStart: 'asc' }
                });
            }
        }
    }
};
