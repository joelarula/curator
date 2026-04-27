/**
 * ScraperService.ts
 *
 * HTML scraper that fetches a URL and extracts readable text content.
 *
 * Strategy:
 *   1. Fetches the URL with a desktop User-Agent string (avoids bot blocks).
 *   2. Strips noise tags (script, style, nav, footer, header, iframe, aside).
 *   3. Prefers semantic article containers (`article`, `main`, `.content`,
 *      `.post-content`) over raw `body` for cleaner extraction.
 *   4. Normalises whitespace and filters blank lines.
 *
 * Used by:
 *   - `FeedAgentService` — via the `scrape_article` tool call so the AI
 *     agent can fetch full content when RSS metadata alone is insufficient.
 *
 * Limitations:
 *   - No JavaScript execution (fetch only). Sites that render content via
 *     client-side JS will return incomplete text.
 *   - Hard timeout of 10 seconds per request.
 */
import * as cheerio from 'cheerio';

export class ScraperService {
    /**
     * Fetches a URL and extracts the title and main text content.
     */
    static async extractFromUrl(url: string): Promise<{ title: string; content: string }> {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
                signal: AbortSignal.timeout(10000), // 10 second timeout
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();
            const $ = cheerio.load(html);

            // 1. Get Title
            const title = $('title').text().trim() || url;

            // 2. Clean up irrelevant tags
            $('script').remove();
            $('style').remove();
            $('nav').remove();
            $('footer').remove();
            $('header').remove();
            $('noscript').remove();
            $('iframe').remove();
            $('aside').remove();

            // 3. Extract text from body
            let content = '';
            
            // Try common article tags first for better content extraction
            const article = $('article, main, .content, .post-content').first();
            if (article.length > 0) {
                content = article.text();
            } else {
                content = $('body').text();
            }

            // 4. Clean up whitespace and format text
            const cleanedContent = content
                .replace(/\s\s+/g, ' ')
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .join('\n');

            if (!cleanedContent || cleanedContent.length < 10) {
                throw new Error('Could not extract meaningful text from URL.');
            }

            return { title, content: cleanedContent };
        } catch (error: any) {
            console.error(`Scraping error for ${url}:`, error.message);
            throw new Error(`Failed to fetch or parse URL: ${error.message}`);
        }
    }
}
