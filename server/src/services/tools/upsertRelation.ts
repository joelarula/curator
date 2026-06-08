import { PrismaClient } from '@prisma/client';
import type { UpsertRelationInput, UpsertRelationOutput } from './types.js';
import { VOCAB } from '../../constants/vocabulary.js';
import { resolveModelName } from '../AIModelRegistry.js';
import { upsertPredicate } from '../PredicateService.js';

/**
 * Upserts an RDF triple (Relation) by resolving subject, predicate, and object URIs.
 * Auto-creates any missing Resource nodes as stubs if they do not exist.
 */
export async function upsertRelation(
    args: UpsertRelationInput,
    prisma: PrismaClient,
    userId: string,
    request?: any
): Promise<UpsertRelationOutput> {

    const { 
        subjectUri, predicateUri, objectUri, 
        justification, aiModel,
        literalValue, literalString, literalDate, literalBoolean, literalDatatype 
    } = args;
    const projectId = request?.projectId ?? null;


    if (!subjectUri)   throw new Error('upsert_relation requires "subjectUri"');
    if (!predicateUri) throw new Error('upsert_relation requires "predicateUri"');
    if (!objectUri)    throw new Error('upsert_relation requires "objectUri"');

    console.log(`[Tools] upsert_relation: <${subjectUri}> <${predicateUri}> <${objectUri}>`);

    // Resolve or auto-create a Resource by URI (Atomic & Scoped to User)
    const resolveResource = async (uri: string) => {
        const safeTitle = uri.substring(0, 250);
        return await prisma.resource.upsert({
            where: { uri },
            update: { deletedAt: null },
            create: {
                uri,
                title: safeTitle,
                userId,
                projectId,
                isPublished: false,
                deletedAt: null
            },
        });
    };



    const [subject, object] = await Promise.all([
        resolveResource(subjectUri),
        resolveResource(objectUri)
    ]);

    const predicate = await upsertPredicate(prisma, userId, {
        uri: predicateUri,
        projectId
    });

    // Resolve model name if string provided
    let resolvedAiModelId: number | null = request?.aiModelId ?? null;

    if (aiModel) {
        const resolvedName = resolveModelName(aiModel);
        const modelRecord = await prisma.aIModel.upsert({
            where: { name: resolvedName },
            update: {},
            create: {
                name: resolvedName,
                shortName: aiModel.substring(0, 10),
                provider: 'Google',
                type: 'GENERATIVE'
            }
        });
        resolvedAiModelId = modelRecord.id;
    }


    // Upsert the Relation triple
    const relation = await prisma.relation.upsert({
        where: {
            subjectId_predicateId_objectId: {
                subjectId:   subject.id,
                predicateId: predicate.id,
                objectId:    object.id,
            },
        },
        update: {
            ...(justification !== undefined && { justification: justification?.substring(0, 1000) }),
            ...(literalValue  !== undefined && { literalValue }),
            ...(literalString !== undefined && { literalString: literalString?.substring(0, 2000) }),
            ...(literalDate   !== undefined && { literalDate: literalDate ? new Date(literalDate) : null }),
            ...(literalBoolean !== undefined && { literalBoolean }),
            ...(literalDatatype !== undefined && { literalDatatype }),
            ...(projectId !== undefined && { projectId }),
            ...(resolvedAiModelId && { aiModelId: resolvedAiModelId }),
        },
        create: {
            subjectId:    subject.id,
            predicateId:  predicate.id,
            objectId:     object.id,
            projectId,
            justification: justification?.substring(0, 1000) || null,
            literalValue: literalValue || null,
            literalString: literalString?.substring(0, 2000) || null,
            literalDate: literalDate ? new Date(literalDate) : null,
            literalBoolean: literalBoolean || null,
            literalDatatype: literalDatatype || null,
            aiModelId: resolvedAiModelId
        }
    });

    // Handle Enum Option Registration
    if (args.registerAsEnumOption) {
        const allowsValueResource = await resolveResource(VOCAB.PROP.allowsValue);
        
        await prisma.relation.upsert({
            where: {
                subjectId_predicateId_objectId: {
                    subjectId: predicate.id,
                    predicateId: allowsValueResource.id,
                    objectId: object.id
                }
            },
            update: {},
            create: {
                subjectId: predicate.id,
                predicateId: allowsValueResource.id,
                objectId: object.id,
                projectId,
                aiModelId: request?.aiModelId ?? null
            }
        });
    }




    console.log(`[Tools] Upserted Relation id ${relation.id}`);

    return {
        success: true,
        data: {
            ...relation,
            subjectUri,
            predicateUri,
            objectUri,
            action: 'upserted',
        },
    };
}

