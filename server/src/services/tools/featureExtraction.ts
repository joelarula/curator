import { pipeline } from '@huggingface/transformers';
import { PrismaClient } from '@prisma/client';
import { resolveModelName, AI_MODELS } from '../AIModelRegistry.js';

const extractors: Record<string, any> = {};

async function getExtractor(modelKey: string) {
    const modelName = resolveModelName(modelKey);
    if (!extractors[modelName]) {
        console.log(`[Tools] Loading feature-extraction model (${modelName})...`);
        extractors[modelName] = await pipeline('feature-extraction', modelName);
    }
    return { extractor: extractors[modelName], modelName };
}

/**
 * Runs a feature-extraction (embedding) pipeline on the given text.
 * Returns a mean-pooled, normalized float array stored as a Text record on the resource.
 *
 * Args:
 *   text:   Text to embed.
 *   model:  Short name or HuggingFace path (default: 'me5').
 *   role:   Text role under which to store the embedding (default: 'EMBEDDING').
 */
export async function featureExtraction(
    args: { text: string; model?: string; role?: string },
    prisma: PrismaClient,
    userId: string,
    responseId?: number,
    request?: any,
) {
    const { text, model = 'me5', role = 'EMBEDDING' } = args;

    if (!text) {
        return { error: 'Missing required argument: text' };
    }

    console.log(`[Tools] feature_extraction: "${text.substring(0, 50)}..." model=${model}`);

    const { extractor, modelName } = await getExtractor(model);

    // multilingual-e5 works best with "query: " prefix
    const isE5 = modelName.includes('e5');
    const input = isE5 ? `query: ${text}` : text;

    const output = await extractor(input, { pooling: 'mean', normalize: true });

    // Flatten to plain number[]
    const raw: number[] = Array.from(output[0]?.data ?? output[0] as Iterable<number>);

    // Persist as a Text record (role=EMBEDDING) on any resource linked to this request
    const requestWithResources = await prisma.request.findUnique({
        where: { id: request.id },
        include: { resources: true },
    });

    const textRole = await prisma.textRole.upsert({
        where: { name: role },
        update: {},
        create: { name: role },
    });

    const stored: number[] = [];
    if (requestWithResources?.resources) {
        for (const resource of requestWithResources.resources) {
            const existing = await prisma.text.findFirst({
                where: { resourceId: resource.id, roleId: textRole.id },
            });
            if (existing) {
                await prisma.text.update({
                    where: { id: existing.id },
                    data: { content: JSON.stringify(raw) },
                });
            } else {
                await prisma.text.create({
                    data: {
                        resourceId: resource.id,
                        roleId: textRole.id,
                        content: JSON.stringify(raw),
                        userId,
                    },
                });
            }
            stored.push(resource.id);
        }
    }

    const finalShortName = AI_MODELS.find(m => m.name === modelName)?.shortName || 'unknown';

    return {
        data: {
            dimensions: raw.length,
            storedOnResources: stored,
            modelUsed: modelName,
        },
        aiModel: {
            shortName: finalShortName,
            name: modelName,
            provider: 'HuggingFace',
        },
    };
}
