import { defineTool } from './CuratorTool.js';

export const web_scraper = defineTool({
  name: 'web_scraper',
  description: 'Fetches the HTML or XML content of any given URL.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full URL to scrape (e.g., https://news.err.ee/rss)'
      }
    },
    required: ['url']
  },
  execute: async (args, _ctx) => {
    try {
      if (typeof args.url !== 'string' || args.url.length === 0) throw new Error('url must be a non-empty string');
      console.log('[web_scraper] Fetching URL: ' + args.url);
      const response = await fetch(args.url);
      const text = await response.text();
      return text.substring(0, 2000);
    } catch(e: unknown) {
      return 'Failed to fetch URL: ' + (e instanceof Error ? e.message : String(e));
    }
  }
});
