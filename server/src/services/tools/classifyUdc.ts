import { PrismaClient } from '@prisma/client';
import { AIService } from '../AIService.js';
import { resolveModelName, AI_MODELS } from '../AIModelRegistry.js';

/**
 * Classifies a resource into UDC categories using an LLM.
 * Updates UDC resources to ACTIVE status and creates relations.
 */
export async function classifyUdc(
    args: any,
    prisma: PrismaClient,
    userId: string,
    responseId?: number,
    request?: any
) {
    console.log(`[Tool] Executing classify_udc...`);
    const { model: modelArg } = args;
    const modelName = modelArg ? resolveModelName(modelArg) : 'gemini-1.5-flash-lite';
    const modelShortName = AI_MODELS.find(m => m.name === modelName)?.shortName ?? modelArg ?? 'g15fl';

    // 1. Get context resource
    // We try to fetch the most recent state from the DB
    const fullRequest = await prisma.request.findUnique({
        where: { id: request.id },
        include: { resources: true }
    });

    const resources = fullRequest?.resources || [];
    console.log(`[Tool] classify_udc: found ${resources.length} resource(s) in context for request ${request.id}`);

    if (resources.length === 0) {
        throw new Error(`classify_udc requires at least one resource in the request context (request ${request.id})`);
    }

    const resource = resources[0]!;
    const textToClassify = `TITLE: ${resource.title}\nDESCRIPTION: ${resource.description || ''}`;

    const prompt = 
    `Classify the following Estonian text into one or more of UDC (Universal Decimal Classification) categories.
    Return ONLY a valid JSON list of objects, each containing:
    - "code": The UDC notation (e.g. "133.52")
    - "title_en": A brief description of the category in English.
    - "title_et": A brief description of the category in Estonian.
    - "explanation": A brief explanation of why this category matches.

${textToClassify}`;

    const result = await AIService.runPromptWithModel(prompt, modelName);
    
    // Extract JSON
    let classifications: any[] = [];
    try {
        const jsonMatch = result.match(/\[\s*\{.*\}\s*\]/s);
        if (jsonMatch) {
            classifications = JSON.parse(jsonMatch[0]);
        } else {
            classifications = JSON.parse(result);
        }
    } catch (e) {
        console.warn(`[Tool] Failed to parse classification JSON, returning raw text: ${e}`);
        return { 
            data: { result },
            aiModel: { name: modelName, shortName: modelShortName, provider: 'Google' }
        };
    }

    return {
        data: {
            rawResult: result,
            categoryCount: classifications.length
        },
        extractedItems: classifications, // For fan-out orchestration
        aiModel: { name: modelName, shortName: modelShortName, provider: 'Google' }
    };
}
