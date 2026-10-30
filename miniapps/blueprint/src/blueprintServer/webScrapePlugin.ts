import { defineTool, type CuratorPluginDefinition } from '../../../../curator/dist/src/index.js';
import { ScraperService } from '../../../../packages/plugin-scraper/dist/index.js';
import { safeFetchText, type SafeFetchOptions } from './safeFetch.js';

export const WEB_READER_ROLE = 'web_reader';

export interface WebScrapeArgs {
  url: string;
  selector?: string;
  maxChars?: number;
}

/** The blueprint server's single remote tool: a public web page as Markdown. */
export function webScrapePlugin(fetchOptions: SafeFetchOptions = {}): CuratorPluginDefinition {
  const webScrape = defineTool<WebScrapeArgs>({
    name: 'web_scrape',
    description:
      'Fetch a public web page and return its main content as Markdown (title, description, text with absolute links). ' +
      'Use for reading articles, docs and pages the user mentions.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'http(s) URL of the page' },
        selector: { type: 'string', description: 'Optional CSS selector for the main content (e.g. "article")' },
        maxChars: { type: 'integer', minimum: 500, maximum: 100000, description: 'Maximum Markdown characters returned (default 20000)' },
      },
      required: ['url'],
    },
    accessLevel: 'read_only',
    requiredRole: WEB_READER_ROLE,
    mcp: { expose: true },
    execute: async (args) => {
      const maxChars = Math.min(Math.max(Number(args.maxChars) || 20000, 500), 100000);
      const page = await safeFetchText(String(args.url), fetchOptions);
      if (page.status >= 400) throw new Error(`HTTP ${page.status} for ${page.finalUrl}`);

      let title = page.finalUrl;
      let description = '';
      let markdown: string;
      if (page.contentType === 'text/plain') {
        markdown = page.body;
      } else {
        const extracted = ScraperService.extractFromHtml(page.body, page.finalUrl, args.selector || undefined);
        title = extracted.title;
        description = extracted.description;
        markdown = extracted.plainContent;
      }
      const truncated = page.truncated || markdown.length > maxChars;
      return {
        url: String(args.url),
        finalUrl: page.finalUrl,
        title,
        description,
        markdown: markdown.length > maxChars ? `${markdown.slice(0, maxChars)}\n\n…` : markdown,
        truncated,
        length: markdown.length,
      };
    },
  });

  return {
    name: 'blueprint-web',
    version: '1.0.0',
    description: 'Blueprint server: web page reading for remote agents',
    tools: { web_scrape: webScrape },
    roles: [{ name: WEB_READER_ROLE, description: 'May read public web pages through web_scrape' }] as any,
  };
}
