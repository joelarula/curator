import { PrismaClient } from '@prisma/client';
import { ScraperService } from '../ScraperService.js';

/**
 * Fetches a web page by URL, extracts its title and main text content,
 * upserts the page as a Resource (type: ARTICLE), and creates/replaces
 * a Text record (role: MAIN) attached to that Resource.
 *
 * Args:
 *   url:         The URL to scrape.
 *   resourceUri: Optional explicit URI for the Resource. Defaults to "url:<url>".
 *   role:        Text role name (default: "MAIN"). E.g. "SUMMARY", "TRANSCRIPT".
 *   onSuccess:   Optional orchestrator callback — fired with the upserted Resource
 *                as createdItem after the text has been written.
 */
export async function scrapeResource(
    args: { url: string; resourceUri?: string; role?: string; onSuccess?: any },
    prisma: PrismaClient,
    userId: string,
    responseId: number
) {
    const { url, resourceUri, role = 'MAIN' } = args;
    if (!url) throw new Error('scrape_resource requires a "url" argument');

    console.log(`[Tools] scrape_resource: processing "${url}"`);

    // 1. Check for cached HTML Text on the resource (stored by fetch_html)
    const uri = resourceUri || `url:${url}`;
    let title: string;
    let content: string;

    const cachedResource = await prisma.resource.findUnique({
        where: { uri },
        include: { texts: { include: { role: true } } },
    });
    const cachedHtml = cachedResource?.texts?.find(t => t.role?.name === 'HTML');

    if (cachedHtml) {
        console.log(`[Tools] scrape_resource: using cached HTML (Text id=${cachedHtml.id})`);
        ({ title, content } = ScraperService.extractFromHtml(cachedHtml.content, url));
    } else {
        console.log(`[Tools] scrape_resource: no cache — fetching "${url}"`);
        ({ title, content } = await ScraperService.extractFromUrl(url));
    }

    // 2. Ensure ResourceType ARTICLE exists
    let articleType = await prisma.resourceType.findUnique({ where: { name: 'ARTICLE' } });
    if (!articleType) {
        articleType = await prisma.resourceType.create({ data: { name: 'ARTICLE' } });
    }

    // 3. Upsert the Resource
    const resource = await prisma.resource.upsert({
        where: { uri },
        update: { title },
        create: {
            uri,
            title,
            resourceTypeId: articleType.id,
            userId,
            isPublished: false,
        },
    });

    console.log(`[Tools] scrape_resource: upserted Resource id=${resource.id} (${uri})`);

    // 4. Ensure TextRole exists
    let textRole = await prisma.textRole.findUnique({ where: { name: role.toUpperCase() } });
    if (!textRole) {
        textRole = await prisma.textRole.create({ data: { name: role.toUpperCase() } });
    }

    // 5. Upsert Text — replace any existing text with same role on this resource
    const existingText = await prisma.text.findFirst({
        where: { resourceId: resource.id, roleId: textRole.id },
    });

    let text;
    if (existingText) {
        text = await prisma.text.update({
            where: { id: existingText.id },
            data: { content },
        });
        console.log(`[Tools] scrape_resource: updated existing Text id=${text.id}`);
    } else {
        text = await prisma.text.create({
            data: {
                content,
                roleId: textRole.id,
                resourceId: resource.id,
                userId,
                isPublished: false,
            },
        });
        console.log(`[Tools] scrape_resource: created Text id=${text.id} (role=${role.toUpperCase()})`);
    }

    return {
        data: {
            resourceId: resource.id,
            resourceUri: resource.uri,
            title: resource.title,
            textId: text.id,
            role: role.toUpperCase(),
            contentLength: content.length,
        },
        createdItem: resource,   // exposed for onSuccess orchestration
    };
}
