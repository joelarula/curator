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

    // Resolve or auto-create a Resource by URI (Scoped to User)
    const resolveResource = async (uri: string) => {
        let resource = await prisma.resource.findUnique({ 
            where: { userId_uri: { userId, uri } } 
        });
        if (!resource) {
            resource = await prisma.resource.create({
                data: {
                    uri,
                    title: uri,
                    userId,
                    isPublished: false,
                    deletedAt: null
                },
            });
            console.log(`[Tools] Auto-created stub Resource: ${uri} (id ${resource.id})`);
        }
        return resource;
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
            ...(justification !== undefined && { justification }),
            ...(literalValue  !== undefined && { literalValue }),
            ...(literalString !== undefined && { literalString }),
            ...(literalDate   !== undefined && { literalDate: literalDate ? new Date(literalDate) : null }),
            ...(literalBoolean !== undefined && { literalBoolean }),
            ...(literalDatatype !== undefined && { literalDatatype }),
            ...(responseId && { responseId }),
        },
        create: {
            subjectId:    subject.id,
            predicateId:  predicate.id,
            objectId:     object.id,
            justification:  justification ?? null,
            literalValue:   literalValue  ?? null,
            literalString:  literalString ?? null,
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

