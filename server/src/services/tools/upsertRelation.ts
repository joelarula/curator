import { PrismaClient } from '@prisma/client';
import type { UpsertRelationInput, UpsertRelationOutput } from './types.js';

/**
 * Upserts an RDF triple (Relation) by resolving subject, predicate, and object URIs.
 * Auto-creates any missing Resource nodes as stubs if they do not exist.
 */
export async function upsertRelation(
    args: UpsertRelationInput,
    prisma: PrismaClient,
    userId: string,
    responseId?: number,
    request?: any
): Promise<UpsertRelationOutput> {

    const { 
        subjectUri, predicateUri, objectUri, 
        justification, 
        literalValue, literalString, literalDate, literalBoolean, literalDatatype 
    } = args;

    if (!subjectUri)   throw new Error('upsert_relation requires "subjectUri"');
    if (!predicateUri) throw new Error('upsert_relation requires "predicateUri"');
    if (!objectUri)    throw new Error('upsert_relation requires "objectUri"');

    console.log(`[Tools] upsert_relation: <${subjectUri}> <${predicateUri}> <${objectUri}>`);

    // Resolve or auto-create a Resource by URI (Atomic & Scoped to User)
    const resolveResource = async (uri: string) => {
        const safeTitle = uri.substring(0, 250);
        return await prisma.resource.upsert({
            where: { userId_uri: { userId, uri } },
            update: { deletedAt: null },
            create: {
                uri,
                title: safeTitle,
                userId,
                isPublished: false,
                deletedAt: null
            },
        });
    };


    const [subject, predicate, object] = await Promise.all([
        resolveResource(subjectUri),
        resolveResource(predicateUri),
        resolveResource(objectUri)
    ]);

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
            ...(responseId && { responseId }),
        },
        create: {
            subjectId:    subject.id,
            predicateId:  predicate.id,
            objectId:     object.id,
            justification:  justification ? justification.substring(0, 1000) : null,
            literalValue:   literalValue  ?? null,
            literalString:  literalString ? literalString.substring(0, 2000) : null,
            literalDate:    literalDate ? new Date(literalDate) : null,
            literalBoolean: literalBoolean ?? null,
            literalDatatype: literalDatatype ?? null,
            responseId:     responseId    ?? null,
        },

    });

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

