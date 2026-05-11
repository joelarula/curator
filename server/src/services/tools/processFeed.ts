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

    // 2. Upsert the feed itself as a Resource (Scoped to User)
    const feedUri = `feed:${url}`;
    const feedResource = await prisma.resource.upsert({
        where: { userId_uri: { userId, uri: feedUri } },
        update: {
            title: feed.title || url,
            description: feed.description || null,
            deletedAt: null
        },
        create: {
            uri: feedUri,
            title: feed.title || url,
            description: feed.description || null,
            userId,
            deletedAt: null,
            isPublished: true
        },
    });

    // Mark as a FEED type semantically
    const typeUri = 'type:feed';
    const typeResource = await prisma.resource.upsert({
        where: { userId_uri: { userId, uri: typeUri } },
        update: { deletedAt: null },
        create: { uri: typeUri, title: 'FEED', userId, deletedAt: null }
    });

    await prisma.relation.upsert({
        where: {
            subjectId_predicateId_objectId: {
                subjectId: feedResource.id,
                predicateId: await getPredicateId(prisma, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', userId),
                objectId: typeResource.id
            }
        },
        update: {},
        create: {
            subjectId: feedResource.id,
            predicateId: await getPredicateId(prisma, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', userId),
            objectId: typeResource.id
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
            feed: feedResource as any,
            stats: {
                total: enrichedItems.length,
                new: enrichedItems.filter((i: any) => i.isNew).length,
                existing: enrichedItems.filter((i: any) => !i.isNew).length
            }
        },
        items: enrichedItems as any[]
    };
}

/**
 * Helper to get or create a predicate resource ID.
 */
async function getPredicateId(prisma: PrismaClient, uri: string, userId: string): Promise<number> {
    const res = await prisma.resource.upsert({
        where: { userId_uri: { userId, uri } },
        update: { deletedAt: null },
        create: {
            uri,
            title: uri,
            userId,
            deletedAt: null
        }
    });
    return res.id;
}

