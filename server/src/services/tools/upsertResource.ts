import { PrismaClient } from '@prisma/client';
import type { UpsertResourceInput, UpsertResourceOutput } from './types.js';

/**
 * Upserts a Resource by URI.
 */
export async function upsertResource(
    args: UpsertResourceInput,
    prisma: PrismaClient,
    userId: string,
    _responseId?: number,
    _request?: any
): Promise<UpsertResourceOutput> {
    const { uri, title, description, status, language, notation, isPublished } = args;
    const type = args.type || args.resourceType;

    if (!uri) throw new Error('upsert_resource requires a "uri" argument');
    if (uri.includes('{{')) {
        throw new Error(`upsert_resource: URI "${uri}" contains unresolved template placeholders. Refusing to save literal template to database.`);
    }

    console.log(`[Tools] Executing upsert_resource for URI: "${uri}"`);

    // Resolve optional ResourceType by name
    let resourceTypeId: number | null = null;
    if (type) {
        let resourceType = await prisma.resourceType.findUnique({ where: { name: type.toUpperCase() } });
        if (!resourceType) {
            resourceType = await prisma.resourceType.create({ data: { name: type.toUpperCase() } });
            console.log(`[Tools] Created new ResourceType: ${type.toUpperCase()}`);
        }
        resourceTypeId = resourceType.id;
    }

    // Resolve optional ResourceStatus by name
    let statusId: number | null = null;
    if (status) {
        let resourceStatus = await prisma.resourceStatus.findUnique({ where: { name: status.toUpperCase() } });
        if (!resourceStatus) {
            resourceStatus = await prisma.resourceStatus.create({ data: { name: status.toUpperCase() } });
            console.log(`[Tools] Created new ResourceStatus: ${status.toUpperCase()}`);
        }
        statusId = resourceStatus.id;
    }

    // Resolve optional Language by code
    let languageId: number | null = null;
    if (language) {
        let lang = await prisma.language.findUnique({ where: { code: language.toLowerCase() } });
        if (!lang) {
            lang = await prisma.language.create({ 
                data: { 
                    code: language.toLowerCase(), 
                    name: language.toUpperCase() // Fallback name
                } 
            });
            console.log(`[Tools] Created new Language: ${language.toLowerCase()}`);
        }
        languageId = lang.id;
    }

    // Default status for NEW records (DRAFT)
    let draftStatusId: number;
    const draftStatus = await prisma.resourceStatus.findUnique({ where: { name: 'DRAFT' } });
    if (draftStatus) {
        draftStatusId = draftStatus.id;
    } else {
        const created = await prisma.resourceStatus.create({ data: { name: 'DRAFT' } });
        draftStatusId = created.id;
    }

    // Upsert the Resource
    const resource = await prisma.resource.upsert({
        where: { uri },
        update: {
            ...(title         !== undefined && { title }),
            ...(description   !== undefined && { description }),
            ...(notation      !== undefined && { notation }),
            ...(isPublished   !== undefined && { isPublished }),
            ...(resourceTypeId !== null     && { resourceTypeId }),
            ...(statusId       !== null     && { statusId }),
            ...(languageId     !== null     && { languageId }),
        },
        create: {
            uri,
            title: title || uri,
            description: description ?? null,
            notation: notation ?? null,
            isPublished: isPublished ?? false,
            resourceTypeId,
            statusId: statusId ?? draftStatusId,
            languageId,
            userId,
        },
        include: {
            status: true,
            resourceType: true,
            language: true,
        }
    });

    console.log(`[Tools] Upserted Resource ID: ${resource.id} (${resource.uri}) status=${resource.status?.name}`);

    // Return object with lookup names instead of IDs for transparency
    const { statusId: _sid, resourceTypeId: _rtid, languageId: _lid, status: s, resourceType: rt, language: l, ...rest } = resource as any;

    return {
        success: true,
        data: {
            ...rest,
            status: s?.name || null,
            resourceType: rt?.name || null,
            language: l?.code || null,
            action: 'upserted',
        },
        createdItem: resource,
    };
}
