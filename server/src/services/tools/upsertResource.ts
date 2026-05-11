import { PrismaClient } from '@prisma/client';
import type { UpsertResourceInput, UpsertResourceOutput } from './types.js';

/**
 * Upserts a Resource by URI.
 */
export async function upsertResource(
    args: UpsertResourceInput,
    prisma: PrismaClient,
    userId: string,
    _request?: any
): Promise<UpsertResourceOutput> {

    const { uri, title, description, status, language, isPublished } = args;
    const type = args.type || args.resourceType;

    if (!uri) throw new Error('upsert_resource requires a "uri" argument');
    if (uri.includes('{{')) {
        throw new Error(`upsert_resource: URI "${uri}" contains unresolved template placeholders. Refusing to save literal template to database.`);
    }

    console.log(`[Tools] Executing upsert_resource for URI: "${uri}"`);

    // 1. Upsert the Core Resource
    const safeTitle = (title || uri).substring(0, 250);

    const resource = await prisma.resource.upsert({
        where: { uri },
        update: {
            ...(title         !== undefined && { title: safeTitle }),
            ...(description   !== undefined && { description }),
            ...(isPublished   !== undefined && { isPublished }),
            existent: true,
            deletedAt: null, // Restore if soft-deleted
        },
        create: {
            uri,
            title: safeTitle,
            description: description ?? null,
            isPublished: isPublished ?? false,
            userId,
            existent: true,
            deletedAt: null,
        },
    });



    console.log(`[Tools] Upserted Resource Core ID: ${resource.id} (${resource.uri})`);

    // 2. Virtual Semantic Mapping: Type, Status, Language
    const mappings = [
        { key: 'type',     predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', prefix: 'type:' },
        { key: 'status',   predicate: 'https://schema.org/status',                      prefix: 'status:' },
        { key: 'language', predicate: 'https://schema.org/inLanguage',                  prefix: 'lang:' }
    ];

    for (const mapping of mappings) {
        const value = (args as any)[mapping.key];
        if (value) {
            const semanticUri = `${mapping.prefix}${value.toString().toLowerCase()}`;
            
            // Ensure the semantic entity exists
            const semanticResource = await prisma.resource.upsert({
                where: { uri: semanticUri },
                update: { existent: true, deletedAt: null },
                create: {
                    uri: semanticUri,
                    title: value.toString(),
                    userId,
                    existent: true,
                    deletedAt: null
                }
            });



            // Create/Update the relation
            await prisma.relation.upsert({
                where: {
                    subjectId_predicateId_objectId: {
                        subjectId: resource.id,
                        predicateId: await getPredicateId(prisma, mapping.predicate, userId),
                        objectId: semanticResource.id
                    }
                },
                update: {},
                create: {
                    subjectId: resource.id,
                    predicateId: await getPredicateId(prisma, mapping.predicate, userId),
                    objectId: semanticResource.id
                }
            });
        }
    }

    return {
        success: true,
        data: {
            ...resource,
            action: 'upserted',
        },
        createdItem: resource,
    };
}

/**
 * Helper to get or create a predicate resource ID.
 */
async function getPredicateId(prisma: PrismaClient, uri: string, userId: string): Promise<number> {
    const res = await prisma.resource.upsert({
        where: { uri },
        update: { existent: true, deletedAt: null },
        create: {
            uri,
            title: uri,
            userId,
            existent: true,
            deletedAt: null
        }
    });

    return res.id;
}

