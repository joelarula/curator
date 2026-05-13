import { PrismaClient } from '@prisma/client';

/**
 * Idempotently creates or updates a Text record on a Resource.
 * 
 * Args:
 *   resourceUri: The URI of the target resource. Defaults to the connected resource's URI if omitted.
 *   role: The text role name (e.g. 'SUMMARY', 'MAIN', 'TRANSCRIPT'). Defaults to 'MAIN'.
 *   content: The actual text content to save.
 */
export async function upsertText(
    args: { resourceUri?: string; role?: string; content: string; mimeType?: string; extension?: string },
    prisma: PrismaClient,
    userId: string,
    responseId?: number,
    request?: any
) {
    const { role = 'MAIN', content, mimeType, extension } = args;
    if (!content) {
        throw new Error('upsert_text requires a "content" argument');
    }

    if (content.includes('{{toolOutputs.') || content.includes('{{iter_')) {
        console.error(`[Tools] upsert_text: Refusing to save unresolved template placeholder: ${content.substring(0, 100)}...`);
        throw new Error(`upsert_text: Content contains unresolved template placeholders. This usually means a previous tool (like scrape_resource) failed or its ID was not correctly referenced.`);
    }

    // Determine the target resource
    let targetUri = args.resourceUri;
    
    if (!targetUri) {
        // If not explicitly provided, try to read from the attached request resources
        const requestWithResources = await prisma.request.findUnique({
            where: { id: request.id },
            include: { resources: true }
        });
        const resources = requestWithResources?.resources;
        if (resources && resources.length > 0) {
            targetUri = resources[0]!.uri;
        }


    }

    if (!targetUri) {
        throw new Error('upsert_text requires a "resourceUri" argument or an attached Resource in the context');
    }

    // Ensure the resource exists
    const resource = await prisma.resource.findUnique({ where: { uri: targetUri } });
    if (!resource) {
        throw new Error(`upsert_text failed: Resource with URI "${targetUri}" not found`);
    }

    // Upsert the text (atomic on resourceId + role)
    const text = await prisma.text.upsert({
        where: { resourceId_role: { resourceId: resource.id, role: role.toUpperCase() } },
        update: { 
            content,
            ...(mimeType  !== undefined && { mimeType }),
            ...(extension !== undefined && { extension }),
        },
        create: {
            content,
            role: role.toUpperCase(),
            resourceId: resource.id,
            userId,
            isPublished: resource.isPublished ?? false,
            mimeType:  mimeType  ?? 'text/plain',
            extension: extension ?? 'txt',
        },
    });


    console.log(`[Tools] upsert_text: saved Text(role=${role.toUpperCase()}) id=${text.id} for Resource ${resource.uri}`);

    return {
        data: {
            textId: text.id,
            resourceUri: resource.uri,
            role: role.toUpperCase(),
            contentLength: content.length,
        },
        createdItem: resource, // Pass the resource forward just like scrape_resource
    };
}
