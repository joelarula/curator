import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

function buildTurndown(): TurndownService {
    const td = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
        linkStyle: 'inlined',
    });

    td.use(gfm);

    td.addRule('remove-noise', {
        filter: ['button', 'form', 'input', 'select', 'textarea'],
        replacement: () => '',
    });

    return td;
}

export interface ScrapeResult {
    title: string;
    description: string;
    keywords: string[];
    author: string;
    content: string; // Full Markdown including YAML front matter
    plainContent: string; // Markdown body without YAML front matter
}

export class ScraperService {
    static async extractFromUrl(url: string, contentSelector?: string, excludeLinkPatterns: string[] = []): Promise<ScrapeResult> {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            },
            signal: AbortSignal.timeout(12000),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status} for "${url}"`);
        const html = await response.text();
        return this.extractFromHtml(html, url, contentSelector, excludeLinkPatterns);
    }

    static extractFromHtml(html: string, baseUrl: string = '', contentSelector?: string, excludeLinkPatterns: string[] = []): ScrapeResult {
        const $ = cheerio.load(html);

        const title =
            $('meta[property="og:title"]').attr('content') ||
            $('title').text().trim() ||
            baseUrl;

        const description =
            $('meta[name="description"]').attr('content') ||
            $('meta[property="og:description"]').attr('content') ||
            '';

        const keywordsRaw =
            $('meta[name="keywords"]').attr('content') || '';
        const keywords = keywordsRaw
            ? keywordsRaw.split(',').map(k => k.trim()).filter(Boolean)
            : [];

        const author =
            $('meta[name="author"]').attr('content') ||
            $('meta[property="article:author"]').attr('content') ||
            '';

        const publishedAt =
            $('meta[property="article:published_time"]').attr('content') ||
            $('meta[name="date"]').attr('content') ||
            '';

        $(
            'script, style, noscript, iframe, [aria-hidden="true"], ' +
            '.cookie-banner, .ad, .advertisement, .social-share, ' +
            'nav, header, footer, aside'
        ).remove();

        if (baseUrl) {
            const base = new URL(baseUrl);
            $('a[href]').each((_i, el) => {
                const href = $(el).attr('href') || '';
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
                try {
                    $(el).attr('href', new URL(href, base).toString());
                } catch {}
            });
            $('img[src]').each((_i, el) => {
                const src = $(el).attr('src') || '';
                try {
                    $(el).attr('src', new URL(src, base).toString());
                } catch {}
            });
        }

        if (excludeLinkPatterns.length > 0) {
            $('a[href]').each((_i, el) => {
                const href = $(el).attr('href') || '';
                if (excludeLinkPatterns.some(pat => href.includes(pat))) {
                    const text = $(el).text().trim();
                    if (text) {
                        $(el).replaceWith(text);
                    } else {
                        $(el).remove();
                    }
                }
            });
        }

        let rootEl;
        if (contentSelector) {
            const selected = $(contentSelector).first();
            if (selected.length > 0) {
                rootEl = selected;
            } else {
                rootEl = $('article, [role="main"], main, .content, .post-content, .article-body').first();
                if (!rootEl.length) rootEl = $('body');
            }
        } else {
            rootEl = $('article, [role="main"], main, .content, .post-content, .article-body').first();
            if (!rootEl.length) rootEl = $('body');
        }
        const innerHtml = rootEl.html() || '';

        const td = buildTurndown();
        let plainContent = td.turndown(innerHtml);
        plainContent = plainContent.replace(/\n{3,}/g, '\n\n').trim();

        const yamlLines: string[] = ['---'];
        yamlLines.push(`title: ${JSON.stringify(title)}`);
        if (description) yamlLines.push(`description: ${JSON.stringify(description)}`);
        if (keywords.length) yamlLines.push(`keywords: [${keywords.map(k => JSON.stringify(k)).join(', ')}]`);
        if (author) yamlLines.push(`author: ${JSON.stringify(author)}`);
        if (publishedAt) yamlLines.push(`publishedAt: ${JSON.stringify(publishedAt)}`);
        if (baseUrl) yamlLines.push(`url: ${JSON.stringify(baseUrl)}`);
        yamlLines.push('---');

        const frontMatter = yamlLines.join('\n');
        const content = `${frontMatter}\n\n# ${title}\n\n${plainContent}`;

        return { title, description, keywords, author, content, plainContent };
    }

    static async extractLinksFromUrl(pageUrl: string, selector: string = 'a[href]'): Promise<{ url: string; title: string }[]> {
        const response = await fetch(pageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        return this.extractLinksFromHtml(html, pageUrl, selector);
    }

    static extractLinksFromHtml(html: string, baseUrl: string, selector: string = 'a[href]'): { url: string; title: string }[] {
        const $ = cheerio.load(html);
        const base = new URL(baseUrl);
        const seen = new Set<string>();
        const links: { url: string; title: string }[] = [];

        const finalSelector = selector.includes('a') ? selector : `${selector} a[href]`;

        $(finalSelector).each((_i, el) => {
            const $el = $(el);
            const href = $el.attr('href') || $el.find('a').attr('href') || '';
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
            try {
                const resolved = new URL(href, base).toString();
                if (!seen.has(resolved)) {
                    seen.add(resolved);
                    links.push({ url: resolved, title: $el.text().trim() || resolved });
                }
            } catch {}
        });
        return links;
    }

    static extractBySelectors(
        html: string,
        baseUrl: string,
        selectors: Record<string, string>
    ): { title: string; content: string; extractedFields: Record<string, string> } {
        const $ = cheerio.load(html);
        const extractedFields: Record<string, string> = {};

        for (const [key, selector] of Object.entries(selectors)) {
            const $el = $(selector);
            extractedFields[key] = $el.text().trim();
        }

        const title = extractedFields['title'] || $('title').text().trim() || baseUrl;
        const content = extractedFields['content'] || extractedFields['description'] || $('body').text().trim();

        return { title, content, extractedFields };
    }
}
