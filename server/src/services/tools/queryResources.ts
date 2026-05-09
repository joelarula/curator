import { PrismaClient } from '@prisma/client';

/**
 * Queries Resources filtered by an RDF relation and fans out a child tool call per result.
 *
 * At least one of subjectUri, predicateUri, or objectUri must be provided.
 * The matching resources (subjects, objects, or both) are returned as extractedItems
 * so the orchestrator can spawn onItemExtracted child requests for each one.
 *
 * Args:
 *   subjectUri:   Filter by subject URI (exact match).
 *   predicateUri: Filter by predicate URI (exact match).
 *   objectUri:    Filter by object URI (exact match).
 *   yieldRole:    Which side of the triple to yield as the item — "subject" | "object" (default: "subject").
 *   statuses:     Optional — only yield resources whose status name is in this list (e.g. ["DRAFT", "ACTIVE"]).
 *   limit:        Max number of resources to yield (default: 100).
 */
export async function queryResources(
    args: {
        subjectUri?: string;
        predicateUri?: string;
        objectUri?: string;
        yieldRole?: 'subject' | 'object';
        statuses?: string[];
        limit?: number;
        onItemExtracted?: any;
    },
    prisma: PrismaClient,
    userId: string,
    responseId: number
) {
    const { subjectUri, predicateUri, objectUri, yieldRole = 'subject', statuses, limit = 100 } = args;

    if (!subjectUri && !predicateUri && !objectUri) {
        throw new Error('query_resources requires at least one of: subjectUri, predicateUri, objectUri');
    }

    console.log(`[Tools] query_resources — subject=${subjectUri ?? '*'} predicate=${predicateUri ?? '*'} object=${objectUri ?? '*'} yield=${yieldRole}`);

    // Build Prisma where clause
    const where: any = {};
    if (subjectUri) {
        const subject = await prisma.resource.findUnique({ where: { uri: subjectUri } });
        if (!subject) {
            console.warn(`[Tools] query_resources: subjectUri "${subjectUri}" not found — returning 0 items`);
            return { data: { count: 0 }, extractedItems: [] };
        }
        where.subjectId = subject.id;
    }
    if (predicateUri) {
        const predicate = await prisma.resource.findUnique({ where: { uri: predicateUri } });
        if (!predicate) {
            console.warn(`[Tools] query_resources: predicateUri "${predicateUri}" not found — returning 0 items`);
            return { data: { count: 0 }, extractedItems: [] };
        }
        where.predicateId = predicate.id;
    }
    if (objectUri) {
        const object = await prisma.resource.findUnique({ where: { uri: objectUri } });
        if (!object) {
            console.warn(`[Tools] query_resources: objectUri "${objectUri}" not found — returning 0 items`);
            return { data: { count: 0 }, extractedItems: [] };
        }
        where.objectId = object.id;
    }

    // Optionally resolve status filter (multi-valued)
    let filterStatusIds: Set<number> | null = null;
    if (statuses && statuses.length > 0) {
        filterStatusIds = new Set<number>();
        for (const s of statuses) {
            const resourceStatus = await prisma.resourceStatus.findUnique({ where: { name: s.toUpperCase() } });
            if (resourceStatus) {
                filterStatusIds.add(resourceStatus.id);
            } else {
                console.warn(`[Tools] query_resources: status "${s.toUpperCase()}" not found in DB — skipped`);
            }
        }
        if (filterStatusIds.size === 0) {
            console.warn(`[Tools] query_resources: none of the requested statuses exist — returning 0 items`);
            return { data: { count: 0, statuses }, extractedItems: [] };
        }
        console.log(`[Tools] query_resources: filtering by statuses [${[...filterStatusIds].join(', ')}]`);
    }

    // Fetch matching relations with both sides included
    const relations = await prisma.relation.findMany({
        where,
        take: limit,
        include: {
            subject: { include: { status: true } },
            object:  { include: { status: true } },
        },
    });

    // Yield either the subject or object side of each triple, then filter by status
    let extractedItems = relations.map(r => yieldRole === 'object' ? r.object : r.subject);
    if (filterStatusIds !== null) {
        extractedItems = extractedItems.filter(r => r.statusId !== null && filterStatusIds!.has(r.statusId));
    }

    console.log(`[Tools] query_resources found ${extractedItems.length} resources to yield (statuses=${statuses?.join(',') ?? 'any'})`);

    return {
        data: {
            count: extractedItems.length,
            subjectUri,
            predicateUri,
            objectUri,
            yieldRole,
            statuses: statuses ?? null,
        },
        extractedItems,
    };
}
