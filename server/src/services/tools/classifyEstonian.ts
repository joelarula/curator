import { pipeline } from '@huggingface/transformers';
import { PrismaClient } from '@prisma/client';
import { resolveModelName, AI_MODELS } from '../AIModelRegistry.js';

const extractors: Record<string, any> = {};

async function getExtractor(modelKey: string) {
    const modelName = resolveModelName(modelKey);
    if (!extractors[modelName]) {
        console.log(`[Tools] Loading Estonian feature-extraction model (${modelName})...`);
        extractors[modelName] = await pipeline('feature-extraction', modelName);
    }
    return { extractor: extractors[modelName], modelName };
}

function cosineSim(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot   += a[i]! * b[i]!;
        normA += a[i]! * a[i]!;
        normB += b[i]! * b[i]!;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

function toArray(tensor: any): number[] {
    // Transformers.js tensors expose .data (Float32Array) or are iterable
    const raw = tensor?.data ?? tensor;
    return Array.from(raw as Iterable<number>);
}

/**
 * Estonian text classifier using embedding-based zero-shot classification.
 * Embeds both the input text and each label, then ranks by cosine similarity.
 *
 * Args:
 *   text:     Estonian text to classify.
 *   labels:   Candidate category labels (ideally in Estonian: "Sport", "Poliitika", …).
 *   model:    Short name or HuggingFace path (default: 'estroberta').
 *   minScore: Cosine similarity threshold — labels below this are dropped (default: 0.20).
 */
export async function classifyEstonian(
    args: { text: string; labels: string[]; model?: string; minScore?: number; template?: string },
    prisma: PrismaClient,
    userId: string,
    responseId: number,
    request: any,
) {
    const { text, labels, model = 'estroberta', minScore = 0.20, template } = args;

    if (!text || !labels || labels.length === 0) {
        return {
            error: 'Missing required arguments: text and labels',
            supportedModels: AI_MODELS.map(m => m.shortName),
        };
    }

    console.log(`[Tools] Estonian classify: "${text.substring(0, 50)}..." model=${model}`);

    const { extractor, modelName } = await getExtractor(model);

    // Expand single-word labels into sentence templates so the model can discriminate.
    // Without this, all cosine scores cluster ~0.7 because single words lack context.
    const isE5 = modelName.includes('e5');
    const defaultTemplate = isE5
        ? (l: string) => `passage: See artikkel räägib teemal: ${l}`
        : (l: string) => `See artikkel räägib teemal: ${l}`;
    const expandLabel = template
        ? (l: string) => template.replace('{label}', l)
        : defaultTemplate;
    const textInput   = isE5 ? `query: ${text}` : text;
    const labelInputs = labels.map(expandLabel);

    const embeddings: number[][] = await Promise.all(
        [textInput, ...labelInputs].map(async (input) => {
            const output = await extractor(input, { pooling: 'mean', normalize: true });
            return toArray(output[0]);
        })
    );

    const textEmbedding   = embeddings[0]!;
    const labelEmbeddings = embeddings.slice(1);

    // Score each label
    const scored = labels.map((label, i) => ({
        label,
        score: cosineSim(textEmbedding, labelEmbeddings[i]!),
    }));

    // Sort descending, keep above threshold
    scored.sort((a, b) => b.score - a.score);
    let matched = scored.filter(x => x.score >= minScore);
    if (matched.length === 0) matched = [scored[0]!]; // always keep top

    console.log(
        `[Tools] Estonian predictions (minScore=${minScore}): ` +
        matched.map(x => `${x.label} ${(x.score * 100).toFixed(1)}%`).join(', ')
    );

    // ── Persist relations ────────────────────────────────────────────────────

    const classType    = await prisma.resourceType.findUnique({ where: { name: 'CLASS' } });
    const activeStatus = await prisma.resourceStatus.findUnique({ where: { name: 'ACTIVE' } });
    const propType     = await prisma.resourceType.findUnique({ where: { name: 'PROPERTY' } });

    const predicate = await prisma.resource.upsert({
        where: { uri: 'property:has_category' },
        update: {},
        create: {
            uri: 'property:has_category',
            title: 'Has Category',
            resourceTypeId: propType?.id || null,
            userId,
            isPublished: true,
        },
    });

    const requestWithResources = await prisma.request.findUnique({
        where: { id: request.id },
        include: { resources: true },
    });

    for (const { label, score } of matched) {
        const categoryUri = `category:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        const categoryResource = await prisma.resource.upsert({
            where: { uri: categoryUri },
            update: {},
            create: {
                uri: categoryUri,
                title: label,
                resourceTypeId: classType?.id || null,
                statusId: activeStatus?.id || null,
                userId,
                isPublished: true,
            },
        });

        if (requestWithResources?.resources) {
            for (const resource of requestWithResources.resources) {
                await prisma.relation.upsert({
                    where: {
                        subjectId_predicateId_objectId: {
                            subjectId: resource.id,
                            predicateId: predicate.id,
                            objectId: categoryResource.id,
                        },
                    },
                    update: { literalValue: score },
                    create: {
                        subjectId: resource.id,
                        predicateId: predicate.id,
                        objectId: categoryResource.id,
                        resourceTypeId: predicate.resourceTypeId!,
                        responseId,
                        literalValue: score,
                    },
                });
            }
        }
    }

    const finalShortName = AI_MODELS.find(m => m.name === modelName)?.shortName || 'unknown';

    return {
        data: {
            category: matched[0]!.label,
            score: matched[0]!.score,
            categories: matched,
            modelUsed: modelName,
        },
        aiModel: {
            shortName: finalShortName,
            name: modelName,
            provider: 'HuggingFace',
        },
    };
}
