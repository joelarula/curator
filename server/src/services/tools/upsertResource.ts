import { PrismaClient } from '@prisma/client';

/**
 * Upserts a Resource by URI.
 *
 * Args:
 *   uri:         The unique URI identifier for the resource (e.g. "person:joel-arula").
 *   title:       Optional human-readable title. Defaults to the URI if not provided.
 *   description: Optional description / summary text.
 *   type:        Optional resource type name (e.g. "PERSON", "ARTICLE"). Looked up by name.
 *   status:      Optional resource status name (e.g. "ACTIVE", "ARCHIVED"). Looked up by name.
 */
export async function upsertResource(
    args: { uri: string; title?: string; description?: string; type?: string; status?: string },
    prisma: PrismaClient,
    userId: string,
    responseId: number
) {
    const { uri, title, description, type, status } = args;
    if (!uri) throw new Error('upsert_resource requires a "uri" argument');

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
            ...(resourceTypeId !== null     && { resourceTypeId }),
            ...(statusId       !== null     && { statusId }),
        },
        create: {
            uri,
            title: title || uri,
            description: description ?? null,
            resourceTypeId,
            statusId: statusId ?? draftStatusId, // Always set to DRAFT on insert if not provided
            userId,
            isPublished: false,
        },
    });

    console.log(`[Tools] Upserted Resource ID: ${resource.id} (${resource.uri}) status=${status ?? 'unchanged'}`);

    return {
        data: {
            id: resource.id,
            uri: resource.uri,
            title: resource.title,
            description: resource.description,
            action: 'upserted',
        },
        createdItem: resource,
    };
}
