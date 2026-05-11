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

    // 2. Upsert the Resource stub (using atomic pattern)
    const resource = await prisma.resource.upsert({
        where: { userId_uri: { userId, uri } },
        update: { 
            ...(title && { title: title.substring(0, 250) }),
            deletedAt: null 
        },
        create: {
            uri,
            title: (title || url).substring(0, 250),
            userId,
            isPublished: false,
            deletedAt: null
        },
    });

    // 3. Ensure "HTML" TextRole exists
    let htmlRole = await prisma.textRole.findUnique({ where: { name: 'HTML' } });
    if (!htmlRole) htmlRole = await prisma.textRole.create({ data: { name: 'HTML' } });

    // 4. Upsert the HTML Text (Multi-tenant safe)
    const existingText = await prisma.text.findFirst({ 
        where: { resourceId: resource.id, roleId: htmlRole.id, userId } 
    });

    const text = await prisma.text.upsert({
        where: { 
            id: existingText?.id || '0' // cuid is string
        },
        update: { content: html },
        create: {
            content: html,
            resourceId: resource.id,
            roleId: htmlRole.id,
            userId,
            isPublished: false,
        }
    });


    return {
        data: {
            ...resource,
            content: html, // Pass HTML content to downstream tools
            textId: text.id,
            bytesFetched: html.length,
        },
        createdItem: resource,
    };
}

