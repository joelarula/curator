import { PrismaClient } from '@prisma/client';
import Parser from 'rss-parser';

export async function processFeed(
    args: { url: string; onItemExtracted?: { yieldTemplateName?: string, prompt?: string, toolCalls?: any } }, 
    prisma: PrismaClient, 
    userId: string,
    responseId: number,
    request: any
) {
    const { url } = args;
    if (!url) throw new Error("Missing required argument: url");

    console.log(`[Tools] Executing process_feed for URL: "${url}"`);

    const parser = new Parser();
    const feed = await parser.parseURL(url);

    // 1. Ensure ResourceType 'FEED' and ResourceStatus 'DRAFT' exist
    let feedType = await prisma.resourceType.findUnique({ where: { name: 'FEED' } });
    if (!feedType) feedType = await prisma.resourceType.create({ data: { name: 'FEED' } });

    let draftStatus = await prisma.resourceStatus.findUnique({ where: { name: 'DRAFT' } });
    if (!draftStatus) draftStatus = await prisma.resourceStatus.create({ data: { name: 'DRAFT' } });

    // 2. Upsert the feed as a Resource
    const feedUri = `feed:${url}`;
    let feedResource = await prisma.resource.findUnique({ where: { uri: feedUri } });
    if (!feedResource) {
        feedResource = await prisma.resource.create({
            data: {
                uri: feedUri,
                title: feed.title || url,
                description: feed.description || null,
                resourceTypeId: feedType.id,
                statusId: draftStatus.id,
                userId,
                isPublished: true,
            }
        });
    }

    // 3. Raw data for Orchestrator
    const toolData = {
        title: feed.title,
        description: feed.description,
        itemsCount: feed.items.length
    };

    // 4. Ensure ResourceType 'URL' and predicate exist
    let urlType = await prisma.resourceType.findUnique({ where: { name: 'URL' } });
    if (!urlType) urlType = await prisma.resourceType.create({ data: { name: 'URL' } });

    let predicate = await prisma.resource.findUnique({ where: { uri: 'property:has_article' } });
    if (!predicate) {
        let propertyType = await prisma.resourceType.findUnique({ where: { name: 'PROPERTY' } });
        if (!propertyType) propertyType = await prisma.resourceType.create({ data: { name: 'PROPERTY' } });
        predicate = await prisma.resource.create({
            data: {
                uri: 'property:has_article',
                title: 'Has Article',
                resourceTypeId: propertyType.id,
                userId,
                isPublished: true,
            }
        });
    }

    // 5. Parse "addresses" (links) and upsert them
    let extractedCount = 0;
    const extractedResources: any[] = [];
    for (const item of feed.items) {
        if (!item.link) continue;
        
        const linkUri = `url:${item.link}`;
        let linkResource = await prisma.resource.findUnique({ where: { uri: linkUri } });
        if (!linkResource) {
            linkResource = await prisma.resource.create({
                data: {
                    uri: linkUri,
                    title: item.title || item.link,
                    description: item.contentSnippet || null,
                    resourceTypeId: urlType.id,
                    statusId: draftStatus.id,
                    userId,
                    isPublished: false,
                }
            });
        }

        // Add relation: Feed -> has_article -> Link
        const existingRelation = await prisma.relation.findFirst({
            where: {
                subjectId: feedResource.id,
                predicateId: predicate.id,
                objectId: linkResource.id,
            }
        });

        if (!existingRelation) {
            await prisma.relation.create({
                data: {
                    resourceTypeId: predicate.resourceTypeId!,
                    subjectId: feedResource.id,
                    predicateId: predicate.id,
                    objectId: linkResource.id,
                    responseId,
                }
            });
            extractedCount++;
            extractedResources.push({
                ...item,
                id: linkResource.id, // For easy connect
                uri: linkResource.uri,
                title: linkResource.title,
                resource: linkResource
            });
        }
    }

    console.log(`[Tools] Successfully processed feed at ${url}, extracted ${extractedCount} new items.`);
    
    return {
        success: true,
        data: toolData,
        extractedItems: extractedResources
    };
}
