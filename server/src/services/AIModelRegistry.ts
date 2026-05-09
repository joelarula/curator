import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_MODELS = path.resolve(__dirname, '../../models');

export interface AIModelDefinition {
    shortName: string;
    name: string;
    provider: string;
    type: string; // e.g. "GENERATIVE", "EMBEDDING"
    url?: string;
    version?: string;
}

export const AI_MODELS: AIModelDefinition[] = [
    // HuggingFace Zero-Shot Models
    {
        shortName: 'distilbert',
        name: 'Xenova/distilbert-base-uncased-mnli',
        provider: 'HuggingFace',
        type: 'GENERATIVE',
        url: 'https://huggingface.co/Xenova/distilbert-base-uncased-mnli'
    },
    {
        shortName: 'bart',
        name: 'Xenova/bart-large-mnli',
        provider: 'HuggingFace',
        type: 'GENERATIVE',
        url: 'https://huggingface.co/Xenova/bart-large-mnli'
    },
    {
        shortName: 'deberta',
        name: 'Xenova/nli-deberta-v3-small',
        provider: 'HuggingFace',
        type: 'GENERATIVE',
        url: 'https://huggingface.co/Xenova/nli-deberta-v3-small'
    },
    {
        shortName: 'mdeberta',
        name: 'Xenova/xlm-roberta-base-xnli',
        provider: 'HuggingFace',
        type: 'GENERATIVE',
        url: 'https://huggingface.co/xlm-roberta-base-xnli'
    },
    {
        // Multilingual sentence embeddings — ONNX available, covers Estonian
        shortName: 'me5',
        name: 'Xenova/multilingual-e5-small',
        provider: 'HuggingFace',
        type: 'EMBEDDING',
        url: 'https://huggingface.co/Xenova/multilingual-e5-small'
    },
    {
        // Estonian RoBERTa — run `optimum-cli export onnx --model tartuNLP/EstRoBERTa --task feature-extraction models/estroberta-onnx` to generate
        shortName: 'estroberta',
        name: path.join(LOCAL_MODELS, 'estroberta-onnx'),
        provider: 'HuggingFace',
        type: 'EMBEDDING',
        url: 'https://huggingface.co/tartuNLP/EstRoBERTa'
    },
    // Google Gemini Models
    {
        shortName: 'g31p',
        name: 'gemini-3.1-pro-preview',
        provider: 'Google',
        type: 'GENERATIVE',
        version: '3.1'
    },
    {
        shortName: 'g31fl',
        name: 'gemini-3.1-flash-lite-preview',
        provider: 'Google',
        type: 'GENERATIVE',
        version: '3.1'
    },
    {
        shortName: 'g30f',
        name: 'gemini-3-flash-preview',
        provider: 'Google',
        type: 'GENERATIVE',
        version: '3.0'
    },
    {
        shortName: 'g25p',
        name: 'gemini-2.5-pro',
        provider: 'Google',
        type: 'GENERATIVE',
        version: '2.5'
    },
    {
        shortName: 'g25f',
        name: 'gemini-2.5-flash',
        provider: 'Google',
        type: 'GENERATIVE',
        version: '2.5'
    },
    {
        shortName: 'g25fl',
        name: 'gemini-2.5-flash-lite',
        provider: 'Google',
        type: 'GENERATIVE',
        version: '2.5'
    },
    {
        shortName: 'g15f',
        name: 'gemini-1.5-flash',
        provider: 'Google',
        type: 'GENERATIVE',
        version: '1.5'
    },
];

/**
 * Resolves a shortName or name to a full model name.
 */
export function resolveModelName(nameOrShortName: string): string {
    const found = AI_MODELS.find(m => m.shortName === nameOrShortName || m.name === nameOrShortName);
    return found ? found.name : nameOrShortName;
}

/**
 * Returns a model definition by shortName or name.
 */
export function getModelInfo(nameOrShortName: string): AIModelDefinition | undefined {
    return AI_MODELS.find(m => m.shortName === nameOrShortName || m.name === nameOrShortName);
}

/**
 * Syncs all defined AI models to the database.
 */
export async function syncAIModelsToDatabase(prisma: PrismaClient): Promise<void> {
    console.log('[AIModelRegistry] Syncing models to database...');
    for (const model of AI_MODELS) {
        await prisma.aIModel.upsert({
            where: { shortName: model.shortName },
            update: {
                name: model.name,
                provider: model.provider,
                type: model.type,
                url: model.url || null,
                version: model.version || null,
                existent: true
            },
            create: {
                shortName: model.shortName,
                name: model.name,
                provider: model.provider,
                type: model.type,
                url: model.url || null,
                version: model.version || null,
                existent: true
            }
        });
    }
    console.log(`[AIModelRegistry] ${AI_MODELS.length} models synced.`);
}
