import { PrismaClient, Prisma } from '@prisma/client';
import type { QueryResourcesInput, QueryResourcesOutput } from './types.js';

/**
 * Advanced Resource Query tool.
 * Enables searching resources by various metadata (URI, title, notation, status, type, dates)
 * and advanced RDF-style relation criteria (subject/predicate/object/literal).
 */
export async function queryResources(
    args: QueryResourcesInput,
    prisma: PrismaClient,
    userId: string
): Promise<QueryResourcesOutput> {
    const { 
        uri, uriContains, 
        title, titleContains, 
        notation, notationContains,
        status, type, isPublished,
        createdAfter, createdBefore,
        updatedAfter, updatedBefore,
        relation,
        limit = 50,
        offset = 0
    } = args;

    console.log(`[Tools] query_resources: criteria=${JSON.stringify(args)}`);

    const where: Prisma.ResourceWhereInput = {
        userId, // Always scope to user
        deletedAt: null,
    };


    // 1. String Filters
    if (uri)         where.uri = uri;
    else if (uriContains) where.uri = { contains: uriContains, mode: 'insensitive' };

    if (title)       where.title = title;
    else if (titleContains) where.title = { contains: titleContains, mode: 'insensitive' };

    if (notation)    where.notation = notation;
    else if (notationContains) where.notation = { contains: notationContains, mode: 'insensitive' };

    // 2. Enum/Type Filters (nested)
    if (isPublished !== undefined) where.isPublished = isPublished;

    // 2. Semantic Filters (Virtualized via Relations)
    const semanticCriteria: Prisma.RelationWhereInput[] = [];

    if (status) {
        const statusList = Array.isArray(status) ? status : [status];
        semanticCriteria.push({
            predicate: { uri: 'https://schema.org/status' },
            object: { uri: { in: statusList.map(s => `status:${s.toLowerCase()}`) } }
        });
    }

    if (type) {
        const typeList = Array.isArray(type) ? type : [type];
        semanticCriteria.push({
            predicate: { uri: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' },
            object: { uri: { in: typeList.map(t => `type:${t.toLowerCase()}`) } }
        });
    }

    if (language) {
        const langList = Array.isArray(language) ? language : [language];
        semanticCriteria.push({
            predicate: { uri: 'https://schema.org/inLanguage' },
            object: { uri: { in: langList.map(l => `lang:${l.toLowerCase()}`) } }
        });
    }

    if (semanticCriteria.length > 0) {
        where.subjectRelations = {
            some: {
                AND: semanticCriteria
            }
        };
    }


    // 3. Date Filters
    if (createdAfter || createdBefore) {
        where.createdAt = {
            ...(createdAfter && { gte: new Date(createdAfter) }),
            ...(createdBefore && { lte: new Date(createdBefore) }),
        };
    }
    if (updatedAfter || updatedBefore) {
        where.updatedAt = {
            ...(updatedAfter && { gte: new Date(updatedAfter) }),
            ...(updatedBefore && { lte: new Date(updatedBefore) }),
        };
    }

    // 4. Advanced Relation Filter (searching for subjects of matching triples)
    if (relation) {
        const relationFilter: Prisma.RelationWhereInput = {};
        
        if (relation.subjectUri) {
            relationFilter.subject = { uri: relation.subjectUri };
        }
        if (relation.predicateUri) {
            relationFilter.predicate = { uri: relation.predicateUri };
        }
        if (relation.objectUri) {
            relationFilter.object = { uri: relation.objectUri };
        }

        // literal filters
        if (relation.literalValue !== undefined || relation.literalGte !== undefined || relation.literalLte !== undefined) {
            relationFilter.literalValue = {
                ...(relation.literalValue !== undefined && { equals: relation.literalValue }),
                ...(relation.literalGte !== undefined && { gte: relation.literalGte }),
                ...(relation.literalLte !== undefined && { lte: relation.literalLte }),
            };
        }
        if (relation.literalString !== undefined) {
            relationFilter.literalString = { contains: relation.literalString, mode: 'insensitive' };
        }
        if (relation.literalDate !== undefined) {
            relationFilter.literalDate = { equals: new Date(relation.literalDate) };
        }
        if (relation.literalBoolean !== undefined) {
            relationFilter.literalBoolean = relation.literalBoolean;
        }
        if (relation.literalDatatype !== undefined) {
            relationFilter.literalDatatype = relation.literalDatatype;
        }


        where.subjectRelations = {
            some: relationFilter
        };
    }

    console.log(`[Tools] query_resources: generated where =`, JSON.stringify(where, null, 2));

    // 5. Execute Query
    const [resources, total] = await Promise.all([
        prisma.resource.findMany({
            where,
            include: { status: true, resourceType: true, language: true },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset
        }),
        prisma.resource.count({ where })
    ]);

    console.log(`[Tools] query_resources: found ${resources.length} (total ${total}) resources.`);

    return {
        success: true,
        data: {
            count: resources.length,
            total
        },
        items: resources
    };
}

