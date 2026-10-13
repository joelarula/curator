import Parser from 'rss-parser';

export interface FeedPollItem {
  uri: string;
  title: string;
  description: string;
  pubDate?: string;
  categories?: string[];
}

export interface FeedPollResult {
  feedUri: string;
  title?: string;
  newItemsCount: number;
  items: FeedPollItem[];
}

/**
 * FeedService
 * RSS and Atom feed polling engine adapted to the Curator Resource triplestore.
 */
export class FeedService {
  private static parser = new Parser();

  /**
   * Polls a single feed URL and persists new items as Resources.
   */
  static async pollFeedUrl(
    prisma: any,
    feedUrl: string,
    options: { userId?: string; projectId?: string; limit?: number } = {}
  ): Promise<FeedPollResult> {
    const parsedFeed = await this.parser.parseURL(feedUrl);
    const feedUri = `feed:${feedUrl}`;
    const userId = options.userId || 'system';
    const projectId = options.projectId;

    if (prisma) {
      await prisma.resource.upsert({
        where: { uri: feedUri },
        update: {
          title: parsedFeed.title || feedUrl,
          description: parsedFeed.description || null,
          deletedAt: null,
        },
        create: {
          uri: feedUri,
          title: parsedFeed.title || feedUrl,
          description: parsedFeed.description || null,
          userId,
          ...(projectId ? { projectId } : {}),
          deletedAt: null,
          isPublished: true,
        },
      });
    }

    const rawItems = parsedFeed.items || [];
    const sliceItems = options.limit ? rawItems.slice(0, options.limit) : rawItems;
    const items: FeedPollItem[] = [];
    let newItemsCount = 0;

    for (const item of sliceItems) {
      if (!item.link) continue;
      const itemUri = item.link;
      const pollItem: FeedPollItem = {
        uri: itemUri,
        title: item.title || 'Untitled',
        description: item.contentSnippet || item.content || '',
        pubDate: item.pubDate,
        categories: item.categories,
      };
      items.push(pollItem);

      if (prisma) {
        const existing = await prisma.resource.findFirst({
          where: { uri: itemUri, existent: true },
        });

        if (!existing) {
          await prisma.resource.create({
            data: {
              uri: itemUri,
              title: pollItem.title,
              description: pollItem.description,
              userId,
              ...(projectId ? { projectId } : {}),
              isPublished: false,
              existent: true,
              deletedAt: null,
            },
          });
          newItemsCount++;
        }
      } else {
        newItemsCount++;
      }
    }

    return {
      feedUri,
      title: parsedFeed.title,
      newItemsCount,
      items,
    };
  }
}
