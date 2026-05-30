import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

export class AIService {
    private static genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
    private static AI_MODEL_NAME = 'gemini-3.1-flash-lite-preview';
    private static FEED_PROMPT_MODEL_NAME = 'gemini-3.1-flash-lite-preview';
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
     */
    static async syncPromptVersion(prisma: PrismaClient) {
        // 1. Ensure Model exists
        const aiModel = await prisma.aIModel.upsert({
            where: { name: this.AI_MODEL_NAME },
            update: {},
            create: {
                shortName: 'g31fl',
                name: this.AI_MODEL_NAME,
                provider: 'Google',
                type: 'GENERATIVE'
            }
        });

        // 2. Ensure Script exists and is updated with the current system prompt
        const currentContent = this.getSystemPrompt();
        const script = await prisma.script.upsert({
            where: { name: this.PROMPT_TEMPLATE_NAME },
            update: { body: currentContent },
            create: {
                name: this.PROMPT_TEMPLATE_NAME,
                body: currentContent,
            }
        });

        return { aiModelId: aiModel.id, scriptId: script.id };
    }

    /**
     * Analyzes content to extract a summary and the author.
     */
    static async analyzeContent(text: string, source?: { title?: string, url?: string }): Promise<{ summary: string; author: string | null; aiModelId?: string; scriptId?: number }> {
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
    static async runPromptWithModel(prompt: string, modelName: string): Promise<string> {
        if (modelName.startsWith('local-')) {
            const llmBaseUrl = process.env.CURATOR_LLM_URL || 'http://127.0.0.1:8080';
            const endpoint = `${llmBaseUrl.replace(/\/$/, '')}/v1/chat/completions`;
            try {
                console.log(`[AIService] Routing prompt to local LLM service: ${modelName} @ ${endpoint}`);
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.3,
                        max_tokens: 2048,
                    }),
                });

                const raw = await response.text();
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} ${response.statusText}: ${raw}`);
                }

                let json: any;
                try {
                    json = JSON.parse(raw);
                } catch {
                    throw new Error(`Expected JSON response from local LLM, got: ${raw}`);
                }

                const content = json?.choices?.[0]?.message?.content;
                if (typeof content !== 'string') {
                    throw new Error(`Unexpected response shape from local LLM: ${raw}`);
                }

                return json.choices[0].message.content.trim();
            } catch (error: any) {
                console.error(`[AIService] Local LLM Inference failed at ${endpoint}: ${error.message}`);
                throw new Error(`Local LLM Inference failed at ${endpoint}: ${error.message}`);
            }
        }

        const model = AIService.genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
        });
        const result = await model.generateContent(prompt);
        return (await result.response).text().trim();
    }

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
