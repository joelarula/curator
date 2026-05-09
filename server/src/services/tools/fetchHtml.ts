import { PrismaClient } from '@prisma/client';

/**
 * Fetches the raw HTML of a URL and stores it as a Text(role=HTML) on the
 * Resource identified by resourceUri. Creates the Resource stub if it does not exist.
 *
 * This is the first step in the pipeline. Downstream tools (scrape_resource,
 * extract_resource_links) will check for a cached HTML Text before re-fetching.
 *
 * Args:
 *   url:         The URL to fetch.
 *   resourceUri: URI for the Resource to attach the HTML to (defaults to the URL itself).
 *   title:       Optional title override for the Resource.
 */
export async function fetchHtml(
    args: { url: string; resourceUri?: string; title?: string; onSuccess?: any },
    prisma: PrismaClient,
    userId: string,
    responseId?: number,
    request?: any
) {
    const { url, resourceUri, title } = args;
    if (!url) throw new Error('fetch_html requires a "url" argument');

    const uri = resourceUri || url;
    console.log(`[Tools] fetch_html: fetching "${url}"`);

    // 1. HTTP fetch
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`fetch_html: HTTP ${response.status} for "${url}"`);

    const html = await response.text();
    console.log(`[Tools] fetch_html: received ${html.length} bytes`);

    // 2. Ensure ResourceType URL and TextRole HTML exist
    let urlType = await prisma.resourceType.findUnique({ where: { name: 'URL' } });
    if (!urlType) urlType = await prisma.resourceType.create({ data: { name: 'URL' } });

    let htmlRole = await prisma.textRole.findUnique({ where: { name: 'HTML' } });
    if (!htmlRole) htmlRole = await prisma.textRole.create({ data: { name: 'HTML' } });

    // 3. Upsert the Resource stub
    const resource = await prisma.resource.upsert({
        where: { uri },
        update: { ...(title && { title }) },
        create: {
            uri,
            title: title || url,
            resourceTypeId: urlType.id,
            userId,
            isPublished: false,
        },
    });

    // 4. Upsert the HTML Text (replace if already cached)
    const existing = await prisma.text.findFirst({
        where: { resourceId: resource.id, roleId: htmlRole.id },
    });

    let text;
    if (existing) {
        text = await prisma.text.update({ where: { id: existing.id }, data: { content: html } });
        console.log(`[Tools] fetch_html: updated cached HTML Text id=${text.id}`);
    } else {
        text = await prisma.text.create({
            data: {
                content: html,
                roleId: htmlRole.id,
                resourceId: resource.id,
                userId,
                isPublished: false,
            },
        });
        console.log(`[Tools] fetch_html: stored HTML Text id=${text.id} (${html.length} bytes)`);
    }

    return {
        data: {
            ...resource,
            textId: text.id,
            bytesFetched: html.length,
        },
        createdItem: resource,  // for onSuccess orchestration
    };
}
