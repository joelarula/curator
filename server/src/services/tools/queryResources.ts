import { PrismaClient, Prisma } from '@prisma/client';
import type { QueryResourcesInput, QueryResourcesOutput } from './types.js';
import { VOCAB } from '../../constants/vocabulary.js';

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
        status, type, language, isPublished,
        createdAfter, createdBefore,
        updatedAfter, updatedBefore,
        relation,
        relations,
        excludeRelation,
        excludeRelations,
        limit = 50,
        offset = 0
    } = args;



    console.log(`[Tools] query_resources: criteria=${JSON.stringify(args)}`);

    const and: Prisma.ResourceWhereInput[] = [
        { existent: true }
    ];



    // 1. String Filters
    if (uri)              and.push({ uri });
    else if (uriContains) and.push({ uri: { contains: uriContains, mode: 'insensitive' } });

    if (title)            and.push({ title });
    else if (titleContains) and.push({ title: { contains: titleContains, mode: 'insensitive' } });

    if (isPublished !== undefined) and.push({ isPublished });

    // 2. Semantic Filters (Virtualised via Relations)
    const buildRelationFilter = (rel: any): Prisma.RelationWhereInput => {
        const filter: Prisma.RelationWhereInput = {};
        if (rel.predicateUri) filter.predicate = { uri: rel.predicateUri };
        if (rel.objectUri)    filter.object = { uri: rel.objectUri };
        else if (rel.objectUriContains) filter.object = { uri: { contains: rel.objectUriContains, mode: 'insensitive' } };
        if (rel.subjectUri)   filter.subject = { uri: rel.subjectUri };

        if (rel.literalValue !== undefined || rel.literalGte !== undefined || rel.literalLte !== undefined) {
            filter.literalValue = {
                ...(rel.literalValue !== undefined && { equals: rel.literalValue }),
                ...(rel.literalGte !== undefined && { gte: rel.literalGte }),
                ...(rel.literalLte !== undefined && { lte: rel.literalLte }),
            };
        }
        if (rel.literalString !== undefined)  filter.literalString = { contains: rel.literalString, mode: 'insensitive' };
        if (rel.literalDate !== undefined)    filter.literalDate = { equals: new Date(rel.literalDate) };
        if (rel.literalBoolean !== undefined) filter.literalBoolean = rel.literalBoolean;
        if (rel.literalDatatype !== undefined) filter.literalDatatype = rel.literalDatatype;
        return filter;
    };

    if (status) {
        const statusList = Array.isArray(status) ? status : [status];
        and.push({
            subjectRelations: {
                some: {
                    predicate: { uri: VOCAB.PROP.status },
                    object: { uri: { in: statusList.flatMap(s => [`status:${s.toLowerCase()}`, `status:status:${s.toLowerCase()}`]) } }
                }
            }
        });
    }

    if (type) {
        const typeList = Array.isArray(type) ? type : [type];
        and.push({
            subjectRelations: {
                some: {
                    predicate: { uri: VOCAB.RDF.type },
                    object: { uri: { in: typeList.flatMap(t => [`type:${t.toLowerCase()}`, `type:type:${t.toLowerCase()}`]) } }
                }
            }
        });
    }


    if (language) {
        const langList = Array.isArray(language) ? language : [language];
        and.push({
            subjectRelations: {
                some: {
                    predicate: { uri: VOCAB.SCHEMA.inLanguage },
                    object: { uri: { in: langList.map(l => `lang:${l.toLowerCase()}`) } }
                }

            }
        });
    }

    // 3. Date Filters
    if (createdAfter || createdBefore) {
        and.push({
            createdAt: {
                ...(createdAfter && { gte: new Date(createdAfter) }),
                ...(createdBefore && { lte: new Date(createdBefore) }),
            }
        });
    }
    if (updatedAfter || updatedBefore) {
        and.push({
            updatedAt: {
                ...(updatedAfter && { gte: new Date(updatedAfter) }),
                ...(updatedBefore && { lte: new Date(updatedBefore) }),
            }
        });
    }

    // 4. Advanced Relation Filters (INTERSECTION)
    if (args.relation) {
        and.push({ subjectRelations: { some: buildRelationFilter(args.relation) } });
    }
    if (args.relations && args.relations.length > 0) {
        for (const rel of args.relations) {
            and.push({ subjectRelations: { some: buildRelationFilter(rel) } });
        }
    }

    // 5. Exclusion Filters (NONE)
    if (args.excludeRelation) {
        and.push({ subjectRelations: { none: buildRelationFilter(args.excludeRelation) } });
    }
    if (args.excludeRelations && args.excludeRelations.length > 0) {
        for (const rel of args.excludeRelations) {
            and.push({ subjectRelations: { none: buildRelationFilter(rel) } });
        }
    }

    const where: Prisma.ResourceWhereInput = { AND: and };


    console.log(`[Tools] query_resources: generated where =`, JSON.stringify(where, null, 2));

    // 5. Execute Query
    const [resources, total] = await Promise.all([
        prisma.resource.findMany({
            where,
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
            total,
            items: resources
        },
        items: resources
    };

}

