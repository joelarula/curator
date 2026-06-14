import { defineTool } from './CuratorTool.js';
import Parser from 'rss-parser';

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
  execute: async (args, _ctx) => {
    try {
      const { url, limit } = args;
      console.log(`[process_feed] Fetching RSS feed: ${url}`);
      
      const parser = new Parser();
      const feed = await parser.parseURL(url);

      const { curatorContext } = await import('../engine/CuratorContext.js');
      const ctx = curatorContext.getContext();
      
      const userId = ctx.userId;
      const projectId = ctx.projectId;
      const prisma = ctx.prisma;

      if (!prisma) {
        throw new Error('PrismaClient not found in context. Ensure this tool is executed within a wrapped context.');
      }

      const { curatorEngine } = await import('../engine/CuratorEngine.js');
      const { SemanticSchemaEngine } = await import('../services/SemanticSchemaEngine.js');
      const engine = new SemanticSchemaEngine(prisma);
      engine.loadRegisteredShapes(curatorEngine);

      const feedUri = `feed:${url}`;
      await engine.createEntity('type:feed', feedUri, {
        title: feed.title || url,
        description: feed.description || null
      }, userId, projectId);

      const feedResource = await prisma.resource.findUnique({ where: { uri: feedUri } });
      if (!feedResource) throw new Error('Failed to create Feed entity');

      const pendingReviewUri = 'folder:pending_review';
      const pendingReviewResource = await prisma.resource.upsert({
        where: { uri: pendingReviewUri },
        update: { deletedAt: null },
        create: { uri: pendingReviewUri, title: 'Pending Review', userId, projectId, deletedAt: null }
      });

      let items = feed.items.map((item: any) => ({
        ...item,
        uri: item.link || null
      })).filter((i: any) => i.uri);

      const existingResources = await prisma.resource.findMany({
        where: { uri: { in: items.map((i: any) => i.uri) } }
      });
      const existingUriSet = new Set(existingResources.map(r => r.uri));

      let newFeedItems = items.filter((item: any) => !existingUriSet.has(item.uri));
      if (limit && limit > 0) {
        newFeedItems = newFeedItems.slice(0, limit);
      }

      const hasPartPredicateUri = 'schema:hasPart';
      const hasPartPredicateResource = await prisma.resource.upsert({
        where: { uri: hasPartPredicateUri },
        update: { deletedAt: null },
        create: { uri: hasPartPredicateUri, title: hasPartPredicateUri, userId, projectId, deletedAt: null }
      });

      const newItems = [];

      for (const item of newFeedItems) {
        const articleResource = await prisma.resource.create({
          data: {
            uri: item.uri,
            title: item.title,
            description: item.contentSnippet || item.content || null,
            userId,
            projectId,
            deletedAt: null
          }
        });

        await prisma.relation.create({
          data: {
            subjectId: feedResource.id,
            predicateId: hasPartPredicateResource.id,
            objectId: articleResource.id
          }
        });

        await prisma.relation.create({
          data: {
            subjectId: pendingReviewResource.id,
            predicateId: hasPartPredicateResource.id,
            objectId: articleResource.id
          }
        });

        newItems.push({
          uri: item.uri,
          title: item.title,
          description: item.contentSnippet || item.content || null
        });
      }

      if (args.format === 'yaml') {
        const yaml = await import('yaml');
        return yaml.stringify(newItems);
      }
      return JSON.stringify(newItems, null, 2);
    } catch (e: any) {
      console.error(`[process_feed] Error:`, e);
      return JSON.stringify({ error: `Failed to process feed: ${e.message}` });
    }
  }
});

