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

    const { subjectUri, predicateUri, objectUri, justification, literalValue } = args;

    if (!subjectUri)   throw new Error('upsert_relation requires "subjectUri"');
    if (!predicateUri) throw new Error('upsert_relation requires "predicateUri"');
    if (!objectUri)    throw new Error('upsert_relation requires "objectUri"');

    console.log(`[Tools] upsert_relation: <${subjectUri}> <${predicateUri}> <${objectUri}>`);

    // Ensure ResourceType RELATION and PROPERTY exist
    const ensureType = async (name: string) => {
        let type = await prisma.resourceType.findUnique({ where: { name } });
        if (!type) type = await prisma.resourceType.create({ data: { name } });
        return type;
    };
    const relationResourceType = await ensureType('RELATION');
    const propertyType = await ensureType('PROPERTY');

    // Resolve or auto-create a Resource by URI
    const resolveResource = async (uri: string, fallbackTypeId: number) => {
        let resource = await prisma.resource.findUnique({ where: { uri } });
        if (!resource) {
            resource = await prisma.resource.create({
                data: {
                    uri,
                    title: uri,
                    resourceTypeId: fallbackTypeId,
                    userId,
                    isPublished: false,
                },
            });
            console.log(`[Tools] Auto-created stub Resource: ${uri} (id ${resource.id})`);
        }
        return resource;
    };

    const subject   = await resolveResource(subjectUri,   relationResourceType.id);
    const predicate = await resolveResource(predicateUri, propertyType.id);
    const object    = await resolveResource(objectUri,    relationResourceType.id);

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
            ...(responseId && { responseId }),
        },
        create: {
            subjectId:    subject.id,
            predicateId:  predicate.id,
            objectId:     object.id,
            resourceTypeId: relationResourceType.id,
            justification:  justification ?? null,
            literalValue:   literalValue  ?? null,
            responseId:     responseId    ?? null,
        },
    });

    console.log(`[Tools] Upserted Relation id ${relation.id}`);

    return {
        success: true,
        data: {
            id:           relation.id,
            subjectUri,
            predicateUri,
            objectUri,
            justification: relation.justification,
            literalValue:  relation.literalValue,
            action: 'upserted',
        },
    };
}
