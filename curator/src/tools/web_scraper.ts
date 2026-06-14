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
      console.log('[web_scraper] Fetching URL: ' + args.url);
      const response = await fetch(args.url);
      const text = await response.text();
      return text.substring(0, 2000);
    } catch(e: any) {
      return 'Failed to fetch URL: ' + e.message;
    }
  }
});
