import { PrismaClient } from '@prisma/client';
import Parser from 'rss-parser';
import type { ProcessFeedInput, ProcessFeedOutput } from './types.js';

export async function processFeed(
    args: ProcessFeedInput, 
    prisma: PrismaClient, 
    userId: string,
    _responseId?: number,
    _request?: any
): Promise<ProcessFeedOutput> {
    const { url } = args;
    if (!url) throw new Error("Missing required argument: url");

    console.log(`[Tools] Executing process_feed for URL: "${url}"`);

    const parser = new Parser();
    const feed = await parser.parseURL(url);

    // 1. Resolve 'FEED' ResourceType and 'DRAFT' ResourceStatus
    let feedType = await prisma.resourceType.findUnique({ where: { name: 'FEED' } });
    if (!feedType) feedType = await prisma.resourceType.create({ data: { name: 'FEED' } });

    let draftStatus = await prisma.resourceStatus.findUnique({ where: { name: 'DRAFT' } });
    if (!draftStatus) draftStatus = await prisma.resourceStatus.create({ data: { name: 'DRAFT' } });

    // 2. Upsert the feed itself as a Resource
    const feedUri = `feed:${url}`;
    const feedResource = await prisma.resource.upsert({
        where: { uri: feedUri },
        update: {
            title: feed.title || url,
            description: feed.description || null,
        },
        create: {
            uri: feedUri,
            title: feed.title || url,
            description: feed.description || null,
            resourceTypeId: feedType.id,
            statusId: draftStatus.id,
            userId,
            isPublished: true,
        },
        include: {
            resourceType: true,
            status: true,
        }
    });

    // 3. Collect item URIs to check existence in bulk
    const items = feed.items.map((item: any) => ({
        ...item,
        uri: item.link ? `url:${item.link}` : null
    })).filter((i: any) => i.uri);

    const uris = items.map((i: any) => i.uri as string);

    // 4. Find existing resources
    const existingResources = await prisma.resource.findMany({
        where: { uri: { in: uris } },
        include: {
            resourceType: true,
            status: true,
        }
    });

    const existingUriMap = new Map(existingResources.map((r: any) => [r.uri, r]));

    // 5. Build enriched items list
    const enrichedItems = items.map((item: any) => {
        const resource = existingUriMap.get(item.uri!);
        return {
            ...item,
            isNew: !resource,
            resource: resource || null,
        };
    });

    console.log(`[Tools] Feed processed: ${url}. Found ${enrichedItems.length} items (${enrichedItems.filter((i: any) => i.isNew).length} new).`);

    return {
        success: true,
        data: {
            feed: feedResource,
            stats: {
                total: enrichedItems.length,
                new: enrichedItems.filter((i: any) => i.isNew).length,
                existing: enrichedItems.filter((i: any) => !i.isNew).length
            }
        },
        items: enrichedItems
    };
}
