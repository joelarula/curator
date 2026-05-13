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
    args: { 
        url: string; 
        html?: string;                     // ← NEW: pre-fetched HTML (e.g. from browser_action)
        resourceUri?: string; 
        role?: string;
        contentSelector?: string;
        excludeLinkPatterns?: string[];
        selectors?: Record<string, string>;
        saveText?: boolean;                // default true — set false to skip DB text write
        onSuccess?: any 
    },

    prisma: PrismaClient,
    userId: string,
    responseId?: number,
    request?: any
) {
    const { url, html: preFetchedHtml, resourceUri, role = 'MAIN', selectors, contentSelector, excludeLinkPatterns = [], saveText = true } = args;
    if (!url) throw new Error('scrape_resource requires a "url" argument');

    console.log(`[Tools] scrape_resource: processing "${url}"${selectors ? ' using jQuery selectors' : ''}`);

    const uri = resourceUri || url;
    let title: string = '';
    let content: string = '';
    let extractedFields: Record<string, string> = {};

    // ── Fast path: raw text/markdown content (GitHub raw, pastebin, etc.) ───
    // Detect by URL pattern OR explicit Content-Type header from server.
    const RAW_URL_PATTERNS = [
        'raw.githubusercontent.com',
        'gist.githubusercontent.com',
        'raw.gitlab.com',
        'pastebin.com/raw',
    ];
    const isRawUrl = RAW_URL_PATTERNS.some(p => url.includes(p));

    if (isRawUrl) {
        console.log(`[Tools] scrape_resource: raw content URL detected — fetching as plain text`);
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Curator/1.0' },
            signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} for "${url}"`);
        content = await response.text();

        // Extract title from YAML front matter if present, else use filename from URL
        const yamlMatch = content.match(/^---\s*\ntitle:\s*["']?(.+?)["']?\s*\n/m);
        title = yamlMatch?.[1] || url.split('/').pop()?.replace(/\.[^.]+$/, '') || url;

    } else {
        // ── Standard path: HTML scraping ────────────────────────────────────
        let html: string;

        if (preFetchedHtml) {
            console.log(`[Tools] scrape_resource: using pre-fetched HTML (${preFetchedHtml.length} chars)`);
            html = preFetchedHtml;
        } else {
            // 1. Check for cached HTML Text on the resource (stored by fetch_html)
            const cachedResource = await prisma.resource.findUnique({
                where: { uri },
                include: { texts: true },
            });
            const cachedHtml = cachedResource?.texts?.find(t => t.role === 'HTML');

            if (cachedHtml) {
                console.log(`[Tools] scrape_resource: using cached HTML (Text id=${cachedHtml.id})`);
                html = cachedHtml.content;
            } else {
                console.log(`[Tools] scrape_resource: no cache — fetching "${url}"`);
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                    },
                    signal: AbortSignal.timeout(12000),
                });
                if (!response.ok) throw new Error(`HTTP ${response.status} for "${url}"`);
                html = await response.text();
            }
        }

        // 2. Extract using Selectors or Markdown conversion
        if (selectors) {
            ({ title, content, extractedFields } = ScraperService.extractBySelectors(html, url, selectors));
        } else {
            const result = ScraperService.extractFromHtml(html, url, contentSelector, excludeLinkPatterns);
            title   = result.title;
            content = result.content;
        }
    }


    // 2. Upsert the Resource (Triple-Native)
    const safeTitle = (title || url).substring(0, 250);
    const resource = await prisma.resource.upsert({
        where: { uri },
        update: { title: safeTitle, deletedAt: null },
        create: {
            uri,
            title: safeTitle,
            userId,
            isPublished: false,
            deletedAt: null
        },
    });


    console.log(`[Tools] scrape_resource: upserted Resource id=${resource.id} (${uri})`);

    // Optionally skip text saving — caller will handle it with upsert_text + regex_replace
    if (!saveText) {
        return {
            data: {
                resourceId:    resource.id,
                resourceUri:   resource.uri,
                title:         resource.title,
                content,          // raw extracted text returned to pipeline
                contentLength: content.length,
            },
            createdItem: resource,
        };
    }

    const text = await prisma.text.upsert({
        where: { resourceId_role: { resourceId: resource.id, role: role.toUpperCase() } },
        update: { content },
        create: {
            content,
            role: role.toUpperCase(),
            resourceId: resource.id,
            userId,
            isPublished: false,
            mimeType:  'text/markdown',
            extension: 'md',
        },
    });



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
