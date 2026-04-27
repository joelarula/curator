import { PrismaClient } from '@prisma/client';

export class WikiService {
    private prisma: PrismaClient;

    constructor(prisma: PrismaClient) {
        this.prisma = prisma;
    }

    /**
     * URL-friendly slugification
     */
    private slugify(text: string): string {
        return text
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')     // Replace spaces with -
            .replace(/[^\w-]+/g, '')  // Remove all non-word chars
            .replace(/--+/g, '-');    // Replace multiple - with single -
    }

    /**
     * Resolves a path like "science/ai/agents" to a Source ID.
     * Automatically creates intermediate Source parents if they don't exist.
     */
    async resolvePath(path: string | null | undefined, userId: string): Promise<string> {
        if (!path) {
            // No path provided - create a standalone source using its ID as local path and materialized path
            const source = await this.prisma.source.create({
                data: {
                    type: 'WIKI_PAGE',
                    status: 'ACTIVE',
                    userId: userId
                }
            });
            const updated = await this.prisma.source.update({
                where: { id: source.id },
                data: { 
                    path: source.id,
                    materializedPath: source.id,
                    depth: 0
                }
            });
            return updated.id;
        }

        // Find by materialized path (Global Namespace, only active)
        const slugifiedPath = path.split('/').filter(s => s.length > 0).map(s => this.slugify(s)).join('/');
        let source = await this.prisma.source.findFirst({
            where: { 
                materializedPath: slugifiedPath,
                existent: true
            }
        });

        if (!source) {
            // If it doesn't exist, we need to create the segments recursively
            const segments = slugifiedPath.split('/');
            let currentParentId: string | null = null;
            let currentFullPath = '';
            let currentDepth = 0;

            for (const segment of segments) {
                currentFullPath = currentFullPath ? `${currentFullPath}/${segment}` : segment;
                
                let segmentSource = await this.prisma.source.findFirst({
                    where: { 
                        materializedPath: currentFullPath,
                        existent: true
                    }
                });

                if (!segmentSource) {
                    segmentSource = await this.prisma.source.create({
                        data: {
                            userId,
                            path: segment,
                            materializedPath: currentFullPath,
                            depth: currentDepth,
                            title: segment,
                            type: 'WIKI_PAGE',
                            parentId: currentParentId,
                            status: 'ACTIVE'
                        }
                    });
                }

                currentParentId = segmentSource.id;
                currentDepth++;
            }
            return currentParentId!;
        }

        return source.id;
    }

    /**
     * Upserts a wiki page (Source + Text)
     */
    async savePage(userId: string, input: { 
        id?: string,
        path?: string, 
        title?: string, 
        content: string, 
        language?: string,
        url?: string,
        publishedAt?: string,
        isPublished?: boolean,
        textParentId?: string,
        parentId?: string,
        tags?: { name: string, value?: string | null }[]
    }) {
        let sourceId: string;

        // 1. Resolve Identity (Source)
        if (input.id) {
            sourceId = input.id;
        } else {
            // Find by path if ID not provided (Creation phase)
            sourceId = await this.resolvePath(input.path, userId);
        }

        // 2. Determine local slug (path) if provided for potential rename
        let localSlug = input.path ? this.slugify(input.path) : null;
        
        // 3. Determine Parent Source
        let parentSourceId: string | null = input.parentId || null;
        if (!parentSourceId && input.textParentId) {
            const parentText = await this.prisma.text.findUnique({
                where: { id: input.textParentId },
                select: { originSourceId: true }
            });
            parentSourceId = parentText?.originSourceId || null;
        }

        // 4. Fetch the Identity to update hierarchy/path
        const source = await this.prisma.source.findUnique({ where: { id: sourceId } });
        if (!source) throw new Error('Source not found');

        const sourceData: any = {};
        
        // Handle Path Rename or Hierarchy Change
        if (localSlug && localSlug !== source.path) {
            sourceData.path = localSlug;
            const parent = source.parentId ? await this.prisma.source.findUnique({ where: { id: source.parentId } }) : null;
            sourceData.materializedPath = parent ? `${parent.materializedPath}/${localSlug}` : localSlug;
        }

        if (parentSourceId && parentSourceId !== source.parentId) {
            const newParent = await this.prisma.source.findUnique({ where: { id: parentSourceId } });
            if (newParent) {
                sourceData.parentId = parentSourceId;
                sourceData.depth = newParent.depth + 1;
                sourceData.materializedPath = `${newParent.materializedPath}/${localSlug || source.path}`;
            }
        }
        // 4. Update Source metadata if provided (already handled above if path/parent changed)
        if (input.title) sourceData.title = input.title;
        if (input.url) sourceData.url = input.url;
        if (input.publishedAt) sourceData.publishedAt = new Date(input.publishedAt);
        if (input.isPublished !== undefined) sourceData.isPublished = input.isPublished;

        if (Object.keys(sourceData).length > 0) {
            await this.prisma.source.update({
                where: { id: sourceId },
                data: sourceData
            });
        }

        // 5. Update or Create Text content (Overwrite logic)
        const existingText = await this.prisma.text.findFirst({
            where: { originSourceId: sourceId },
            orderBy: { createdAt: 'desc' }
        });

        const textData: any = {
            content: input.content,
            language: input.language || 'et',
            userId: userId,
            originSourceId: sourceId,
            isPublished: input.isPublished ?? false
        }

        if (input.tags) {
            textData.tags = {
                connectOrCreate: (input.tags as any[]).map(t => ({
                    where: { name_value: { name: t.name, value: t.value || null } },
                    create: { name: t.name, value: t.value || null }
                }))
            }
        }

        let text;
        if (existingText) {
            // Apply 'set: []' to clear old tags only on update
            if (input.tags) {
                textData.tags.set = [];
            }
            text = await this.prisma.text.update({
                where: { id: existingText.id },
                data: textData
            });
        } else {
            text = await this.prisma.text.create({
                data: textData
            });
        }

        /* 
         * 6. Reprocess relations (Deferred for future planning)
         * await this.processRelations(sourceId, input.content, userId);
         */

        return { sourceId, textId: text.id };
    }


    /**
     * Scans content for links and registers relations
     */
    private async processRelations(fromSourceId: string, content: string, userId: string) {
        // Find internal links: [[path]] or [[path|title]]
        const wikiLinkRegex = /\[\[(.*?)\]\]/g;
        let match;
        
        await this.prisma.relation.deleteMany({
            where: { fromSourceId }
        });

        while ((match = wikiLinkRegex.exec(content)) !== null) {
            const linkContent = match[1];
            if (!linkContent) continue;

            const [path, _title] = linkContent.split('|').map(s => s.trim());
            if (!path) continue;
            
            try {
                const toSourceId = await this.resolvePath(path, userId);
                await this.prisma.relation.create({
                    data: {
                        fromSourceId,
                        toSourceId,
                        role: 'LINK',
                        metadata: { anchor: linkContent }
                    }
                });
            } catch (e) {
                console.error(`Failed to resolve relation path: ${path}`, e);
            }
        }

        // Also handle external links: [title](url)
        const markdownLinkRegex = /\[(.*?)\]\((.*?)\)/g;
        while ((match = markdownLinkRegex.exec(content)) !== null) {
            const label = match[1];
            const url = match[2];
            if (url && url.startsWith('http')) {
                // Register external source if it doesn't exist
                let externalSource = await this.prisma.source.findUnique({
                    where: { url }
                });

                if (!externalSource) {
                    externalSource = await this.prisma.source.create({
                        data: {
                            url,
                            type: 'WEB',
                            status: 'NEW',
                            userId
                        }
                    });
                }

                await this.prisma.relation.create({
                    data: {
                        fromSourceId,
                        toSourceId: externalSource.id,
                        role: 'REFERENCE',
                        metadata: { anchor: label }
                    }
                });
            }
        }
    }

    /**
     * Fetches lazy-loaded tree (Global Namespace, filtering hidden)
     */
    async getChildren(parentId: string | null) {
        return await this.prisma.source.findMany({
            where: {
                parentId,
                existent: true,
                type: 'WIKI_PAGE'
            },
            include: {
                _count: {
                    select: { children: true }
                }
            },
            orderBy: { title: 'asc' }
        });
    }
}
