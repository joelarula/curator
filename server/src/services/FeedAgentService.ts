import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';
import { ScraperService } from './ScraperService.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Agentic Feed Processor
 * 
 * Runs the user's AI prompt as a system instruction with tool access.
 * The AI autonomously decides what to do with each feed item:
 * approve, discard, tag, summarize, etc.
 */
export class FeedAgentService {
    private static genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

    // Tool definitions the AI agent can invoke
    private static toolDeclarations: FunctionDeclaration[] = [
        {
            name: 'approve_source',
            description: 'Keep this source in the knowledge base. Optionally update its title and description with improved versions.',
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    title: { type: SchemaType.STRING, description: 'Updated title (optional, leave empty to keep original)' },
                    description: { type: SchemaType.STRING, description: 'Updated/cleaned description (optional)' },
                },
                required: []
            }
        },
        {
            name: 'discard_source',
            description: 'Remove this source from the active knowledge base. Use when the article is irrelevant, low-quality, or does not match the criteria.',
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    reason: { type: SchemaType.STRING, description: 'Brief reason for discarding' },
                },
                required: ['reason']
            }
        },
        {
            name: 'tag_source',
            description: 'Add a semantic tag to this source for categorization. Can be called multiple times to add multiple tags.',
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    name: { type: SchemaType.STRING, description: 'Tag name/category (e.g. "topic", "region", "priority")' },
                    value: { type: SchemaType.STRING, description: 'Tag value (e.g. "politics", "Tallinn", "high")' },
                },
                required: ['name', 'value']
            }
        },
        {
            name: 'save_analysis',
            description: 'Save a text analysis, summary, translation, or any processed content as a Text record attached to this source. Supports markdown.',
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    content: { type: SchemaType.STRING, description: 'The text content to save (markdown supported)' },
                    language: { type: SchemaType.STRING, description: 'Language code (e.g. "et", "en", "ru"). Default: "et"' },
                },
                required: ['content']
            }
        },
        {
            name: 'set_status',
            description: 'Set the processing status of this source.',
            parameters: {
                type: SchemaType.OBJECT,
                properties: {
                    status: { type: SchemaType.STRING, description: 'Status value: "NEW", "REVIEWED", "PROCESSED", "IMPORTANT", "ARCHIVE"' },
                },
                required: ['status']
            }
        },
        {
            name: 'scrape_article',
            description: 'Fetch and extract the full text content from the article URL. Use this when you need to read the full article to make a decision or produce a summary. Only call this if the title/description alone is not enough.',
            parameters: {
                type: SchemaType.OBJECT,
                properties: {},
                required: []
            }
        }
    ];

    /**
     * Runs the agentic pipeline for a single feed item.
     * The AI gets the article content + user's prompt and can call tools autonomously.
     */
    static async processItem(
        prisma: PrismaClient,
        userPrompt: string,
        source: { id: string; title: string; url: string; description: string | null },
        userId: string
    ): Promise<{ actions: string[] }> {
        const actions: string[] = [];

        const model = this.genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            tools: [{ functionDeclarations: this.toolDeclarations }],
            systemInstruction: `You are an AI feed processor for a knowledge management system. 
Your job is to process incoming news/articles according to the user's instructions below.
You have access to tools to scrape, approve, discard, tag, and analyze sources.
You will first receive the RSS metadata (title, description, URL). 
If you need the full article text, use the scrape_article tool.
Always make a final decision — either approve or discard every item.

USER INSTRUCTIONS:
${userPrompt}`,
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4096,
            }
        });

        const chat = model.startChat();

        // Initial message: present the article to the agent
        const initialMessage = `Process this feed item:

TITLE: ${source.title}
URL: ${source.url}
DESCRIPTION: ${source.description || 'N/A'}

Decide what to do with this item. You may scrape the full article if you need more context.`; // Cap at 15k chars to stay within context

        let response = await chat.sendMessage(initialMessage);
        let candidate = response.response;

        // Multi-turn tool execution loop (max 10 iterations for safety)
        let iterations = 0;
        while (iterations < 10) {
            iterations++;

            const calls = candidate.functionCalls();
            if (!calls || calls.length === 0) {
                // Model is done — no more tool calls
                break;
            }

            // Execute all tool calls in this turn
            const toolResults = [];
            for (const call of calls) {
                const result = await this.executeTool(
                    prisma, call.name, call.args as Record<string, any>,
                    source, userId
                );
                actions.push(`${call.name}: ${JSON.stringify(call.args)}`);
                toolResults.push({
                    functionResponse: {
                        name: call.name,
                        response: result
                    }
                });
            }

            // Feed tool results back to the model for next step
            response = await chat.sendMessage(toolResults);
            candidate = response.response;
        }

        return { actions };
    }

    /**
     * Executes a single tool call against the database.
     */
    private static async executeTool(
        prisma: PrismaClient,
        toolName: string,
        args: Record<string, any>,
        source: { id: string; title: string; url: string },
        userId: string
    ): Promise<Record<string, any>> {
        switch (toolName) {
            case 'approve_source': {
                const updateData: any = { status: 'REVIEWED' };
                if (args.title) updateData.title = args.title;
                if (args.description) updateData.description = args.description;
                await prisma.source.update({
                    where: { id: source.id },
                    data: updateData
                });
                return { success: true, message: `Source "${source.title}" approved.` };
            }

            case 'discard_source': {
                await prisma.source.update({
                    where: { id: source.id },
                    data: { existent: null, status: 'DISCARDED' }
                });
                return { success: true, message: `Source "${source.title}" discarded. Reason: ${args.reason}` };
            }

            case 'tag_source': {
                const tag = await prisma.tag.upsert({
                    where: { name_value: { name: args.name, value: args.value || null } },
                    create: { name: args.name, value: args.value || null },
                    update: {}
                });
                await prisma.source.update({
                    where: { id: source.id },
                    data: { tags: { connect: { id: tag.id } } }
                });
                return { success: true, message: `Tagged with ${args.name}: ${args.value}` };
            }

            case 'save_analysis': {
                await prisma.text.create({
                    data: {
                        content: args.content,
                        language: args.language || 'et',
                        userId,
                        originSourceId: source.id,
                        isPublished: false
                    }
                });
                return { success: true, message: `Analysis saved (${args.content.length} chars)` };
            }

            case 'set_status': {
                await prisma.source.update({
                    where: { id: source.id },
                    data: { status: args.status }
                });
                return { success: true, message: `Status set to ${args.status}` };
            }

            case 'scrape_article': {
                try {
                    const { title, content } = await ScraperService.extractFromUrl(source.url);
                    // Update title if scraped one is richer
                    if (title && title.length > (source.title?.length || 0)) {
                        await prisma.source.update({
                            where: { id: source.id },
                            data: { title }
                        });
                    }
                    return { 
                        success: true, 
                        title: title || source.title,
                        content: content.substring(0, 15000),  // Cap for context window
                        message: `Scraped ${content.length} characters from ${source.url}` 
                    };
                } catch (err: any) {
                    return { success: false, message: `Failed to scrape: ${err.message}` };
                }
            }

            default:
                return { success: false, message: `Unknown tool: ${toolName}` };
        }
    }
}
