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
        resourceUri: string;    // Used as the base URL for resolving relative links
        html?: string;          // Option A: pre-fetched HTML
        markdown?: string;      // Option B: pre-fetched Markdown
        maxLinks?: number;
        sameDomainOnly?: boolean;
        selector?: string;      // CSS selector to target specific links (HTML only)
        onItemExtracted?: any;  // consumed by the orchestrator
    },
    _prisma: PrismaClient,
    _userId: string,
    _request?: any
) {

    const { resourceUri, html, markdown, maxLinks = 50, sameDomainOnly = false, selector } = args;
    if (!resourceUri) throw new Error('extract_resource_links requires "resourceUri" (base URL)');
    if (!html && !markdown) throw new Error('extract_resource_links requires either "html" or "markdown" input');

    console.log(`[Tools] extract_resource_links: extracting links from pre-provided content (base: "${resourceUri}")`);

    let links: { url: string; title: string }[];

    if (markdown) {
        console.log(`[Tools] extract_resource_links: processing Markdown (${markdown.length} chars)`);
        // Extract standard Markdown links: [Title](URL)
        const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
        links = [];
        let match;
        while ((match = regex.exec(markdown)) !== null) {
            links.push({ title: match[1]!, url: match[2]! });
        }
    } else {
        console.log(`[Tools] extract_resource_links: processing HTML (${html!.length} chars)`);
        links = ScraperService.extractLinksFromHtml(html!, resourceUri, selector);
    }


    // 3. Filter and limit
    if (sameDomainOnly) {
        const baseDomain = new URL(resourceUri).hostname;
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
