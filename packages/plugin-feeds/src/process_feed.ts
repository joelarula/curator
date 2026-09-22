import Parser from 'rss-parser';

export interface CuratorTool {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  execute: (args: any, context?: any) => Promise<any>;
}

export function defineTool(tool: CuratorTool): CuratorTool {
  return tool;
}

export const process_feed = defineTool({
  name: 'process_feed',
  description: 'Fetches and parses an RSS/Atom feed into Semantic Resources inside the System Project.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full URL to the RSS feed'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of items to process (optional)'
      },
      format: {
        type: 'string',
        enum: ['json', 'yaml'],
        description: 'Output format (default: json)'
      }
    },
    required: ['url']
  },
  execute: async (args, toolContext) => {
    try {
      const url = args.url;
      if (typeof url !== 'string' || url.length === 0) throw new Error('url must be a non-empty string');
      const limit = args.limit;
      if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1)) {
        throw new Error('limit must be a positive integer');
      }
      console.log(`[process_feed] Fetching RSS feed: ${url}`);
      
      const parser = new Parser();
      const feed = await parser.parseURL(url);

      const ctx = toolContext || {};
      const userId = ctx.userId || 1;
      const projectId = ctx.projectId || 1;
      const prisma = ctx.prisma;

      if (!prisma) {
        // Return raw feed items when prisma triplestore is not attached
        const items = feed.items.slice(0, limit || feed.items.length).map((item: any) => ({
          title: item.title,
          link: item.link,
          content: item.contentSnippet || item.content,
          pubDate: item.pubDate,
        }));
        return JSON.stringify(items, null, 2);
      }

      // If prisma is attached, sync with triplestore
      const feedUri = `feed:${url}`;
      await prisma.resource.upsert({
        where: { uri: feedUri },
        update: { title: feed.title || url, description: feed.description || null },
        create: { uri: feedUri, title: feed.title || url, description: feed.description || null, userId, projectId }
      });

      const items = feed.items.map((item: any) => ({
        ...item,
        uri: item.link || null
      })).filter((i: any) => i.uri);

      const toProcess = limit ? items.slice(0, limit) : items;
      const newItems: any[] = [];

      for (const item of toProcess) {
        const itemUri = item.uri;
        const exists = await prisma.resource.findUnique({ where: { uri: itemUri } });
        if (exists) continue;

        await prisma.resource.create({
          data: {
            uri: itemUri,
            title: item.title,
            description: item.contentSnippet || item.content || null,
            userId,
            projectId,
          }
        });

        newItems.push({
          uri: itemUri,
          title: item.title,
          description: item.contentSnippet || item.content || null
        });
      }

      return JSON.stringify(newItems, null, 2);
    } catch (e: any) {
      console.error(`[process_feed] Error:`, e);
      return JSON.stringify({ error: `Failed to process feed: ${e.message}` });
    }
  }
});
