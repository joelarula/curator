import { pipeline } from '@huggingface/transformers';
import { PrismaClient } from '@prisma/client';
import { resolveModelName, AI_MODELS } from '../AIModelRegistry.js';

const classifiers: Record<string, any> = {};

/**
 * Lazy-loads the zero-shot classification pipeline for a specific model.
 */
async function getClassifier(modelKey: string) {
    const modelName = resolveModelName(modelKey);
    if (!classifiers[modelName]) {
        console.log(`[Tools] Loading Zero-Shot Classification model (${modelName})...`);
        classifiers[modelName] = await pipeline('zero-shot-classification', modelName);
    }
    return { classifier: classifiers[modelName], modelName };
}

/**
 * Generic classification tool using Zero-Shot models.
 * 
 * Args:
 *   text:   The content or title to classify.
 *   labels: List of candidate category labels.
 *   model:  Optional model key ('distilbert', 'bart', 'deberta') or full HuggingFace path.
 */
export async function classify(
    args: { text: string; labels: string[]; model?: string; minScore?: number },
    prisma: PrismaClient,
    userId: string,
    responseId: number,
    request: any
) {
    const { text, labels, model = 'distilbert', minScore = 0.10 } = args;

    if (!text || !labels || labels.length === 0) {
        return {
            error: "Missing required arguments: text and labels",
            supportedModels: AI_MODELS.map(m => m.shortName)
        };
    }

    console.log(`[Tools] Classifying text: "${text.substring(0, 50)}..." using model: ${model}`);
    
    const { classifier, modelName } = await getClassifier(model);
    const result = await classifier(text, labels);

    // All labels at or above the threshold, in ranked order
    const matched: { label: string; score: number }[] = result.labels
        .map((label: string, i: number) => ({ label, score: result.scores[i] as number }))
        .filter((x: { label: string; score: number }) => x.score >= minScore);

    // Always keep at least the top label even if it falls below threshold
    if (matched.length === 0) matched.push({ label: result.labels[0], score: result.scores[0] });

    console.log(`[Tools] Predictions (minScore=${minScore}): ${matched.map(x => `${x.label} ${(x.score * 100).toFixed(1)}%`).join(', ')}`);

    // Shared lookup — do once outside the per-label loop
    const classType   = await prisma.resourceType.findUnique({ where: { name: 'CLASS' } });
    const activeStatus = await prisma.resourceStatus.findUnique({ where: { name: 'ACTIVE' } });
    const propType    = await prisma.resourceType.findUnique({ where: { name: 'PROPERTY' } });

    const predicate = await prisma.resource.upsert({
        where: { uri: 'property:has_category' },
        update: {},
        create: {
            uri: 'property:has_category',
            title: 'Has Category',
            resourceTypeId: propType?.id || null,
            userId,
            isPublished: true,
        }
    });

    const requestWithResources = await prisma.request.findUnique({
        where: { id: request.id },
        include: { resources: true }
    });

    // Upsert one category resource + one relation per matched label
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
            }
        });

        if (requestWithResources?.resources) {
            for (const resource of requestWithResources.resources) {
                await prisma.relation.upsert({
                    where: {
                        subjectId_predicateId_objectId: {
                            subjectId: resource.id,
                            predicateId: predicate.id,
                            objectId: categoryResource.id,
                        }
                    },
                    update: {
                        literalValue: score,
                    },
                    create: {
                        subjectId: resource.id,
                        predicateId: predicate.id,
                        objectId: categoryResource.id,
                        resourceTypeId: predicate.resourceTypeId!,
                        responseId,
                        literalValue: score,
                    }
                });
            }
        }
    }

    const topLabel = matched[0]!.label;
    const topScore = matched[0]!.score;
    const finalShortName = AI_MODELS.find(m => m.name === modelName)?.shortName || 'unknown';

    return {
        data: {
            category: topLabel,
            score: topScore,
            categories: matched,
            labels: result.labels,
            scores: result.scores,
            modelUsed: modelName
        },
        aiModel: {
            shortName: finalShortName,
            name: modelName,
            provider: 'HuggingFace'
        }
    };
}
