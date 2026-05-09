import { PrismaClient } from '@prisma/client';
import { ScraperService } from '../ScraperService.js';

/**
 * Fetches the HTML of a Resource, extracts all hyperlinks, and returns them
 * as extractedItems for fan-out via onItemExtracted.
 *
 * Each extracted item has: uri, title, parentUri
 * — allowing downstream tools to upsert the link resource and then create
 *   a "links_to" relation back to the parent.
 *
 * Args:
 *   resourceUri:    URI of the parent Resource (used as the URL to fetch unless url is given).
 *   url:            Optional explicit URL to fetch (if different from resourceUri).
 *   maxLinks:       Maximum number of links to yield (default: 50).
 *   sameDomainOnly: If true, only yield links on the same domain (default: false).
 */
export async function extractResourceLinks(
    args: {
        resourceUri: string;
        url?: string;
        maxLinks?: number;
        sameDomainOnly?: boolean;
        onItemExtracted?: any;  // consumed by the orchestrator
    },
    prisma: PrismaClient,
    userId: string,
    responseId: number
) {
    const { resourceUri, url, maxLinks = 50, sameDomainOnly = false } = args;
    if (!resourceUri) throw new Error('extract_resource_links requires "resourceUri"');

    const pageUrl = url || resourceUri;
    console.log(`[Tools] extract_resource_links: extracting links from "${pageUrl}"`);

    // 1. Find the parent Resource (must exist)
    const parentResource = await prisma.resource.findUnique({
        where: { uri: resourceUri },
        include: { texts: { include: { role: true } } },
    });
    if (!parentResource) throw new Error(`extract_resource_links: Resource not found for URI "${resourceUri}"`);

    // 2. Use cached HTML if available, otherwise fetch
    let links: { url: string; title: string }[];
    const cachedHtml = parentResource.texts?.find(t => (t.role as any)?.name === 'HTML');

    if (cachedHtml) {
        console.log(`[Tools] extract_resource_links: using cached HTML (Text id=${cachedHtml.id})`);
        links = ScraperService.extractLinksFromHtml(cachedHtml.content, pageUrl);
    } else {
        console.log(`[Tools] extract_resource_links: no cache — fetching "${pageUrl}"`);
        links = await ScraperService.extractLinksFromUrl(pageUrl);
    }

    // 3. Filter and limit
    if (sameDomainOnly) {
        const baseDomain = new URL(pageUrl).hostname;
        links = links.filter(l => {
            try { return new URL(l.url).hostname === baseDomain; } catch { return false; }
        });
    }
    links = links.slice(0, maxLinks);

    console.log(`[Tools] extract_resource_links: found ${links.length} links to fan out`);

    // 4. Build extractedItems — plain objects with uri/title/parentUri
    //    parentUri is included so onSuccess chains can reference it via {{resource.parentUri}}
    const extractedItems = links.map(l => ({
        id: null,               // no DB ID yet — upsert_resource will create it
        uri: l.url,
        title: l.title || l.url,
        parentUri: resourceUri, // carried through for upsert_relation downstream
    }));

    return {
        data: {
            parentResourceUri: resourceUri,
            linksFound: links.length,
        },
        extractedItems,
    };
}
