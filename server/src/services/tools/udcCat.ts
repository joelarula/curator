import { PrismaClient } from '@prisma/client';

/**
 * Ensures a UDC resource and its hierarchy exist in the main graph.
 */
async function ensureUdcResource(code: string, prisma: PrismaClient, userId: string): Promise<any> {
    const classType = await prisma.resourceType.findUnique({ where: { name: 'CLASS' } });
    const activeStatus = await prisma.resourceStatus.findUnique({ where: { name: 'ACTIVE' } });

    // 1. Check if already instantiated
    let res = await prisma.resource.findFirst({
        where: { notation: code, resourceTypeId: classType?.id ?? null }
    });

    if (res) {
        // If it exists but is archived/draft, maybe activate it?
        if (activeStatus && res.statusId !== activeStatus.id) {
            res = await prisma.resource.update({
                where: { id: res.id },
                data: { statusId: activeStatus.id }
            });
        }
        return res;
    }

    // 2. Not instantiated, find in UdcLookup
    const lookup = await prisma.udcLookup.findUnique({ where: { notation: code } });
    if (!lookup) {
        // Fallback: Create a basic resource if not in lookup
        return await prisma.resource.create({
            data: {
                uri: `udc:${code.replace(/[^a-zA-Z0-9]/g, '_')}`,
                title: `UDC ${code}`,
                notation: code,
                resourceTypeId: classType?.id ?? null,
                statusId: activeStatus?.id ?? null,
                userId: userId
            }
        });
    }

    // 3. Create Resource from lookup
    res = await prisma.resource.create({
        data: {
            uri: lookup.uri,
            title: lookup.etLabel || lookup.title,
            notation: lookup.notation,
            resourceTypeId: classType?.id ?? null,
            statusId: activeStatus?.id ?? null,
            userId: userId
        }
    });

    // 4. Create ResourceTree node
    const treeNode = await prisma.resourceTree.upsert({
        where: { treeName_resourceId: { treeName: 'UDC', resourceId: res.id } },
        update: {},
        create: {
            treeName: 'UDC',
            resourceId: res.id,
            treeStart: lookup.treeStart,
            treeEnd: lookup.treeEnd,
            depth: lookup.depth,
        }
    });

    // 5. Handle parent hierarchy recursively
    if (lookup.parentUri) {
        const parentLookup = await prisma.udcLookup.findUnique({ where: { uri: lookup.parentUri } });
        if (parentLookup) {
            const parentRes = await ensureUdcResource(parentLookup.notation, prisma, userId);
            const parentTreeNode = await prisma.resourceTree.findUnique({
                where: { treeName_resourceId: { treeName: 'UDC', resourceId: parentRes.id } }
            });
            if (parentTreeNode) {
                await prisma.resourceTree.update({
                    where: { id: treeNode.id },
                    data: { parentId: parentTreeNode.id }
                });
            }
        }
    }

    return res;
}

/**
 * udc_cat tool — Handles persistence of a single UDC category classification.
 */
export async function udcCat(
    args: any,
    prisma: PrismaClient,
    userId: string,
    responseId: number,
    request: any
) {
    const { code, category_name, explanation } = args;
    if (!code) throw new Error('udc_cat requires a "code" argument');

    console.log(`[Tool] Executing udc_cat for: ${code}`);

    const propertyType = await prisma.resourceType.findUnique({ where: { name: 'PROPERTY' } });

    // 1. Get context resource
    const fullRequest = await prisma.request.findUnique({
        where: { id: request.id },
        include: { resources: true }
    });

    if (!fullRequest?.resources?.length) {
        throw new Error('udc_cat requires at least one resource in the request context');
    }

    const subjectResource = fullRequest.resources[0]!;

    // 2. Ensure UDC Resource and Hierarchy
    const udcRes = await ensureUdcResource(code, prisma, userId);

    // 3. Create the Category Relation (dc:subject)
    const subjectPredicate = await prisma.resource.upsert({
        where: { uri: 'http://purl.org/dc/terms/subject' },
        update: {},
        create: {
            uri: 'http://purl.org/dc/terms/subject',
            title: 'subject',
            userId: userId,
            resourceTypeId: propertyType?.id ?? null
        }
    });

    const relation = await prisma.relation.create({
        data: {
            subjectId: subjectResource.id,
            predicateId: subjectPredicate.id,
            objectId: udcRes.id,
            resourceTypeId: propertyType?.id || 1,
            responseId
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
