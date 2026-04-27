import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

export class AIService {
    private static genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
    private static AI_MODEL_NAME = 'gemini-2.0-flash-lite';
    private static FEED_PROMPT_MODEL_NAME = 'gemini-2.0-flash';
    private static PROMPT_TEMPLATE_NAME = 'TEXT_SUMMARY_ENGINE_V1';

    private static model = AIService.genAI.getGenerativeModel({
        model: AIService.AI_MODEL_NAME,
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
        }
    });

    // Freeform model for user-defined feed prompts (no JSON enforcement)
    private static feedPromptModel = AIService.genAI.getGenerativeModel({
        model: AIService.FEED_PROMPT_MODEL_NAME,
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096,
        }
    });

    private static getSystemPrompt(): string {
        return `Please analyze the following text and provide a result in JSON format with the following keys:
- "summary": A concise summary of the text in Estonian (et).
- "author": The name of the author (if found), otherwise "anonymous".`;
    }

    /**
     * Ensures the current prompt and model are registered in the database.
     * Creates new versions or models ad-hoc if needed.
     */
    static async syncPromptVersion(prisma: PrismaClient) {
        // 1. Ensure Model exists
        const aiModel = await prisma.aIModel.upsert({
            where: { name: this.AI_MODEL_NAME },
            update: {},
            create: {
                name: this.AI_MODEL_NAME,
                provider: 'Google',
                type: 'GENERATIVE'
            }
        });

        // 2. Ensure Template exists
        const template = await prisma.promptTemplate.upsert({
            where: { name: this.PROMPT_TEMPLATE_NAME },
            update: {},
            create: {
                name: this.PROMPT_TEMPLATE_NAME,
                description: 'Core engine for text summarization and author extraction.'
            }
        });

        // 3. Check for Version
        const latestVersion = await prisma.promptVersion.findFirst({
            where: { templateId: template.id },
            orderBy: { version: 'desc' }
        });

        const currentContent = this.getSystemPrompt();

        if (!latestVersion || latestVersion.content !== currentContent) {
            const nextVersionNumber = (latestVersion?.version || 0) + 1;
            const newVersion = await prisma.promptVersion.create({
                data: {
                    templateId: template.id,
                    version: nextVersionNumber,
                    content: currentContent,
                    optimizedForModelId: aiModel.id
                }
            });
            return { aiModelId: aiModel.id, promptVersionId: newVersion.id };
        }

        return { aiModelId: aiModel.id, promptVersionId: latestVersion.id };
    }

    /**
     * Analyzes content to extract a summary and the author.
     */
    static async analyzeContent(text: string, source?: { title?: string, url?: string }): Promise<{ summary: string; author: string | null; aiModelId?: string; promptVersionId?: string }> {
        try {
            const systemPrompt = this.getSystemPrompt();
            const fullPrompt = `${systemPrompt}
            
            ${source ? `Source Info:\nTitle: ${source.title || 'N/A'}\nURL: ${source.url || 'N/A'}\n\n` : ''}Text:
            ${text}`;

            const result = await this.model.generateContent(fullPrompt);
            const response = await result.response;
            const jsonResponse = JSON.parse(response.text().trim());
            
            return {
                summary: jsonResponse.summary || '',
                author: jsonResponse.author || null
            };
        } catch (error: any) {
            console.error('AI Analysis error:', error.message);
            return { summary: '', author: null };
        }
    }

    /**
     * @deprecated Use analyzeContent instead.
     */
    static async summarize(text: string): Promise<string> {
        const { summary } = await this.analyzeContent(text);
        return summary;
    }

    /**
     * Runs a user-defined AI prompt against scraped article content.
     * Used by the Feed pipeline to process each new item automatically.
     * Returns freeform text (markdown) — the user controls the output format via their prompt.
     */
    static async runFeedPrompt(
        userPrompt: string, 
        article: { title: string; content: string; url: string }
    ): Promise<string> {
        try {
            const fullPrompt = `${userPrompt}

---
ARTICLE TITLE: ${article.title}
ARTICLE URL: ${article.url}

ARTICLE CONTENT:
${article.content}`;

            const result = await this.feedPromptModel.generateContent(fullPrompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error: any) {
            console.error(`AI Feed prompt error for "${article.title}":`, error.message);
            return `[AI processing failed: ${error.message}]`;
        }
    }
}
