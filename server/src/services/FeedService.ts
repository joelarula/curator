/**
 * FeedService.ts
 *
 * RSS/Atom feed polling engine.
 *
 * Responsibilities:
 *   - `pollFeed(feedId)` — Parses a single feed URL, creates a new Source
 *     record for each unseen item, applies default tags, then optionally
 *     fires the AI agentic pipeline (FeedAgentService) for each new item.
 *   - `pollAllFeeds()` — Iterates all active, enabled feeds and calls
 *     `pollFeed` for each. Called by the server's scheduled cron job.
 *
 * Deduplication:
 *   An item is considered "already seen" if a Source with the same URL
 *   exists AND has `existent: true`. Soft-deleted (discarded) sources
 *   are invisible to this check, so a re-discovered item after a discard
 *   is treated as new.
 *
 * AI pipeline:
 *   If the feed has an `aiPrompt`, the pipeline is fired asynchronously
 *   (fire-and-forget) so the polling loop doesn't block waiting for
 *   Gemini responses. Failures are logged and the source is marked
 *   `AI_FAILED` without crashing the poll.
 */
import Parser from 'rss-parser';
import { PrismaClient } from '@prisma/client';
import { FeedAgentService } from './FeedAgentService.js';

export class FeedService {
    private static parser = new Parser();

    /**
     * Polls a specific feed, creates new Source entries, and optionally runs
     * the feed's AI prompt against scraped article content.
     */
    static async pollFeed(prisma: PrismaClient, feedId: string) {
        const feed = await prisma.feed.findUnique({
            where: { id: feedId }
        }) as any;  // Cast to any until Prisma client is regenerated with new fields

        if (!feed) throw new Error(`Feed with ID ${feedId} not found.`);

        const parsedFeed = await this.parser.parseURL(feed.url);
        let newItemsCount = 0;

        for (const item of parsedFeed.items) {
            if (!item.link) continue;

            // Only skip if the URL exists AND is still active.
            // Removed sources (existent: null) won't block re-creation.
            const existing = await prisma.source.findFirst({
                where: { url: item.link, existent: true }
            } as any);

            if (!existing) {
                const sourceData: any = {
                    url: item.link,
                    title: item.title || 'Untitled',
                    description: item.contentSnippet || item.content || '',
                    type: 'WEB',
                    status: 'NEW',
                    userId: feed.userId,
                    isPublished: false,
                    feeds: {
                        connect: { id: feed.id }
                    }
                };

                // Auto-tagging from feed defaults
                if (feed.defaultTagName) {
                    sourceData.tags = {
                        connectOrCreate: [{
                            where: { 
                                name_value: { 
                                    name: feed.defaultTagName, 
                                    value: feed.defaultTagValue || null 
                                } 
                            },
                            create: { 
                                name: feed.defaultTagName, 
                                value: feed.defaultTagValue || null 
                            }
                        }]
                    };
                }

                const newSource = await prisma.source.create({
                    data: sourceData
                });

                // AI Pipeline: scrape full content, then run user's prompt
                if (feed.aiPrompt && item.link) {
                    // Fire-and-forget: don't block the polling loop
                    this.processAITask(prisma, feed, newSource, item.link).catch(err => {
                        console.error(`AI pipeline error for ${item.link}:`, err.message);
                    });
                }

                newItemsCount++;
            }
        }

        // Update last polled time
        await prisma.feed.update({
            where: { id: feedId },
            data: { lastPolledAt: new Date() }
        });

        return newItemsCount;
    }

    /**
     * Scrapes article content and runs the feed's AI prompt against it.
     * Creates a Text record on the source with the AI output.
     */
    private static async processAITask(
        prisma: PrismaClient,
        feed: any,
        source: any,
        url: string
    ) {
        try {
            // Run the agentic pipeline — AI sees RSS metadata first,
            // then decides whether to scrape, approve, discard, tag, etc.
            const result = await FeedAgentService.processItem(
                prisma,
                feed.aiPrompt,
                { id: source.id, title: source.title, url, description: source.description },
                feed.userId
            );

            console.log(`✓ Agent pipeline complete for: ${source.title || url}`);
            console.log(`  Actions: ${result.actions.join(', ') || 'none'}`);
        } catch (error: any) {
            console.error(`Agent pipeline failed for ${url}:`, error.message);
            await prisma.source.update({
                where: { id: source.id },
                data: { status: 'AI_FAILED' }
            }).catch(() => {});
        }
    }

    /**
     * Polls all active and enabled feeds.
     */
    static async pollAllFeeds(prisma: PrismaClient) {
        const feeds = await prisma.feed.findMany({
            where: { 
                existent: true,
                enabled: true   // Respect the user's enabled/disabled toggle
            } as any
        });

        const results = [];
        for (const feed of feeds) {
            try {
                const count = await this.pollFeed(prisma, feed.id);
                results.push({ feedId: feed.id, name: feed.name, newItems: count });
            } catch (error: any) {
                console.error(`Error polling feed ${feed.name}:`, error.message);
                results.push({ feedId: feed.id, name: feed.name, error: error.message });
            }
        }
        return results;
    }
}
