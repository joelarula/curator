import { PrismaClient } from '@prisma/client';

/**
 * Ensures a UDC resource exists in the main graph.
 * Since we seed UDC categories, this usually just returns the existing record.
 */
async function ensureUdcResource(code: string, prisma: PrismaClient, userId: string): Promise<any> {
    const uri = `udc:${code.replace(/[^a-zA-Z0-9]/g, '_')}`;
    // 1. Check if already instantiated
    let res = await prisma.resource.findUnique({
        where: { uri }
    });

    if (res) return res;

    // 2. Fallback: Create a basic resource if not found (unlikely after seed)
    return await prisma.resource.create({
        data: {
            uri,
            title: `UDC ${code}`,
            userId: userId,
            isPublished: true,
            deletedAt: null
        }
    });
}

/**
 * udc_cat tool — Handles persistence of a single UDC category classification.
 */
export async function udcCat(
    args: any,
    prisma: PrismaClient,
    userId: string,
    responseId?: number,
    request?: any
) {
    const { code, explanation } = args;
    if (!code) throw new Error('udc_cat requires a "code" argument');

    console.log(`[Tool] Executing udc_cat for: ${code}`);

    // 1. Get context resource
    const fullRequest = await prisma.request.findUnique({
        where: { id: request.id },
        include: { resources: true }
    });

    if (!fullRequest?.resources?.length) {
        throw new Error('udc_cat requires at least one resource in the request context');
    }

    const subjectResource = fullRequest.resources[0]!;

    // 2. Ensure UDC Resource
    const udcRes = await ensureUdcResource(code, prisma, userId);

    // 3. Create the Category Relation (dc:subject)
    const predicateUri = 'http://purl.org/dc/terms/subject';
    const subjectPredicate = await prisma.resource.upsert({
        where: { uri: predicateUri },
        update: { deletedAt: null },
        create: {
            uri: predicateUri,
            title: 'subject',
            userId,
            deletedAt: null,
            isPublished: true
        }
    });

    const relation = await prisma.relation.upsert({
        where: {
            subjectId_predicateId_objectId: {
                subjectId: subjectResource.id,
                predicateId: subjectPredicate.id,
                objectId: udcRes.id
            }
        },
        update: {
            // responseId removed from schema
        },
        create: {
            subjectId: subjectResource.id,
            predicateId: subjectPredicate.id,
            objectId: udcRes.id,
            // responseId removed from schema
        }
    });


    return {
        data: {
            code,
            category_name: udcRes.title,
            relationId: relation.id,
            udcResourceId: udcRes.id,
            explanation
        },
        createdItem: udcRes
    };
}

