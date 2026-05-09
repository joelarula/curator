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
    args: { resourceUri?: string; role?: string; content: string },
    prisma: PrismaClient,
    userId: string,
    responseId: number,
    request: any
) {
    const { role = 'MAIN', content } = args;
    if (!content) {
        throw new Error('upsert_text requires a "content" argument');
    }

    // Determine the target resource
    let targetUri = args.resourceUri;
    
    if (!targetUri) {
        // If not explicitly provided, try to read from the attached request resources
        const requestWithResources = await prisma.request.findUnique({
            where: { id: request.id },
            include: { resources: true }
        });
        if (requestWithResources?.resources && requestWithResources.resources.length > 0) {
            targetUri = requestWithResources.resources[0].uri;
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

    // Ensure the role exists
    let textRole = await prisma.textRole.findUnique({ where: { name: role.toUpperCase() } });
    if (!textRole) {
        textRole = await prisma.textRole.create({ data: { name: role.toUpperCase() } });
    }

    // Upsert the text
    const existingText = await prisma.text.findFirst({
        where: { resourceId: resource.id, roleId: textRole.id },
    });

    let text;
    if (existingText) {
        text = await prisma.text.update({
            where: { id: existingText.id },
            data: { content },
        });
    } else {
        text = await prisma.text.create({
            data: {
                content,
                roleId: textRole.id,
                resourceId: resource.id,
                userId,
                isPublished: resource.isPublished ?? false,
            },
        });
    }

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
