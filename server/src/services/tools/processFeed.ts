import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import Parser from 'rss-parser';

export async function processFeed(
    args: { url: string; onItemExtracted?: { yieldTemplateName: string } }, 
    prisma: PrismaClient, 
    userId: string,
    responseId: string,
    request: any
) {
    const { url } = args;
    if (!url) throw new Error("Missing required argument: url");

    console.log(`[Tools] Executing process_feed for URL: "${url}"`);

    const parser = new Parser();
    const feed = await parser.parseURL(url);

    // 1. Ensure ResourceType 'FEED' exists
    let feedType = await prisma.resourceType.findUnique({ where: { name: 'FEED' } });
    if (!feedType) feedType = await prisma.resourceType.create({ data: { name: 'FEED' } });

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
                userId,
                isPublished: true,
            }
        });
    }

    // 3. Write raw data into Response
    await prisma.response.update({
        where: { id: responseId },
        data: {
            content: JSON.stringify({
                title: feed.title,
                description: feed.description,
                itemsCount: feed.items.length
            }, null, 2)
        }
    });

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
                    uri: `relation:${crypto.randomUUID()}`,
                    resourceTypeId: predicate.resourceTypeId!,
                    subjectId: feedResource.id,
                    predicateId: predicate.id,
                    objectId: linkResource.id,
                    responseId,
                }
            });
            extractedCount++;
            
            // Check for onItemExtracted callback to spawn a new Request
            if (args.onItemExtracted?.yieldTemplateName) {
                const templateName = args.onItemExtracted.yieldTemplateName;
                const template = await prisma.promptTemplate.findUnique({
                    where: { userId_name: { userId, name: templateName } }
                });

                if (template) {
                    // Create a new Prompt using the template, attached to this new linkResource
                    const newPrompt = await prisma.prompt.create({
                        data: {
                            uri: `prompt:yield-${Date.now()}-${Math.random()}`,
                            templateId: template.id,
                            userId,
                            prompt: template.prompt,
                            toolCalls: template.toolCalls as any || null,
                            resources: { connect: { id: linkResource.id } }
                        }
                    });

                    // Push a new Request into the same Conversation!
                    await prisma.request.create({
                        data: {
                            status: 'NEW',
                            promptId: newPrompt.id,
                            conversationId: request.conversationId,
                            // Optionally track workflow parent/child via a parentId field if added later
                        }
                    });
                    console.log(`[Tools] Spawning child request for extracted item using template: ${templateName}`);
                } else {
                    console.warn(`[Tools] Callback template '${templateName}' not found for user ${userId}.`);
                }
            }
        }
    }

    console.log(`[Tools] Successfully processed feed at ${url}, extracted ${extractedCount} new items.`);
}
