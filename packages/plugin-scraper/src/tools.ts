import { ScraperService } from './ScraperService.js';
import { safeFetchText, type SafeFetchOptions } from './safeFetch.js';

/**
 * Plain tool definition, shaped like curator's `defineTool` options. Kept free of curator imports so
 * curator itself can depend on this package; hosts wrap it: `defineTool({ ...webScrapeTool(), requiredRole })`.
 */
export interface ScraperToolSpec<TArgs, TOutput> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  accessLevel: 'read_only';
  execute: (args: TArgs) => Promise<TOutput>;
}

export interface WebScrapeArgs {
  url: string;
  selector?: string;
  maxChars?: number;
}

export interface WebScrapeResult {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  markdown: string;
  truncated: boolean;
  length: number;
}

export interface WebFetchRawArgs {
  url: string;
  maxChars?: number;
}

export interface WebFetchRawResult {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
  length: number;
}

const RAW_TYPES = [
  'text/html', 'application/xhtml+xml', 'text/plain',
  'application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml', 'application/json',
];

const maxCharsParam = { type: 'integer', minimum: 500, maximum: 100000, description: 'Maximum characters returned (default 20000)' };

function clampMaxChars(value: unknown): number {
  return Math.min(Math.max(Number(value) || 20000, 500), 100000);
}

/** A public web page's main content as Markdown (title, description, text with absolute links). */
export function webScrapeTool(fetchOptions: SafeFetchOptions = {}): ScraperToolSpec<WebScrapeArgs, WebScrapeResult> {
  return {
    name: 'web_scrape',
    description:
      'Fetch a public web page and return its main content as Markdown (title, description, text with absolute links). ' +
      'Use for reading articles, docs and pages the user mentions.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'http(s) URL of the page' },
        selector: { type: 'string', description: 'Optional CSS selector for the main content (e.g. "article")' },
        maxChars: maxCharsParam,
      },
      required: ['url'],
    },
    accessLevel: 'read_only',
    execute: async (args) => {
      const maxChars = clampMaxChars(args.maxChars);
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
      return {
        url: String(args.url),
        finalUrl: page.finalUrl,
        title,
        description,
        markdown: markdown.length > maxChars ? `${markdown.slice(0, maxChars)}\n\n…` : markdown,
        truncated: page.truncated || markdown.length > maxChars,
        length: markdown.length,
      };
    },
  };
}

/** A public URL's raw response text (HTML, XML/RSS/Atom, JSON, plain text), unprocessed. */
export function webFetchRawTool(fetchOptions: SafeFetchOptions = {}): ScraperToolSpec<WebFetchRawArgs, WebFetchRawResult> {
  return {
    name: 'web_scraper',
    description: 'Fetch a public URL and return the raw response text (HTML, XML/RSS/Atom, JSON or plain text), unprocessed.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full http(s) URL to fetch (e.g., https://news.err.ee/rss)' },
        maxChars: maxCharsParam,
      },
      required: ['url'],
    },
    accessLevel: 'read_only',
    execute: async (args) => {
      const maxChars = clampMaxChars(args.maxChars);
      const page = await safeFetchText(String(args.url), { acceptedTypes: RAW_TYPES, ...fetchOptions });
      if (page.status >= 400) throw new Error(`HTTP ${page.status} for ${page.finalUrl}`);
      return {
        url: String(args.url),
        finalUrl: page.finalUrl,
        status: page.status,
        contentType: page.contentType,
        body: page.body.length > maxChars ? page.body.slice(0, maxChars) : page.body,
        truncated: page.truncated || page.body.length > maxChars,
        length: page.body.length,
      };
    },
  };
}
