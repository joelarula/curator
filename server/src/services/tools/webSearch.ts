import type { PrismaClient } from '@prisma/client';

export interface WebSearchResult {
    url:     string;
    title:   string;
    snippet: string;
}

/**
 * Queries Google Custom Search JSON API and returns the top N organic results.
 *
 * Required environment variables:
 *   GOOGLE_SEARCH_API_KEY  — API key from https://console.cloud.google.com/
 *   GOOGLE_SEARCH_CX       — Programmable Search Engine ID from https://programmablesearchengine.google.com/
 *
 * Free tier: 100 queries/day.
 *
 * Args:
 *   query:  Search query string.
 *   limit:  Max number of results (default 5, max 10 per API call).
 *
 * Returns: { items: [{ url, title, snippet }], query, count }
 */
export async function webSearch(
    args: { query: string; limit?: number },
    _prisma: PrismaClient,
    _userId: string
) {
    const { query, limit = 5 } = args;
    if (!query) throw new Error('web_search requires a "query" argument');

    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx     = process.env.GOOGLE_SEARCH_CX;

    if (!apiKey || !cx) {
        throw new Error(
            'web_search: missing GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_CX env vars.\n' +
            '  1. Create an API key at https://console.cloud.google.com/ (Custom Search API)\n' +
            '  2. Create a search engine at https://programmablesearchengine.google.com/\n' +
            '  3. Add to your .env file:\n' +
            '     GOOGLE_SEARCH_API_KEY=your_key\n' +
            '     GOOGLE_SEARCH_CX=your_cx_id'
        );
    }

    // Google CSE returns max 10 per request; limit to min(limit, 10)
    const num = Math.min(limit, 10);

    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(num));

    console.log(`[Tools] web_search: querying Google CSE for "${query}" (num=${num})`);

    const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Google CSE returned HTTP ${response.status}: ${err}`);
    }

    const data = await response.json() as any;

    const items: WebSearchResult[] = (data.items ?? []).map((item: any) => ({
        url:     item.link,
        title:   item.title,
        snippet: item.snippet ?? '',
    }));

    console.log(`[Tools] web_search: found ${items.length} results for "${query}"`);

    return {
        success: true,
        data: {
            query,
            count: items.length,
            items,
        }
    };
}
