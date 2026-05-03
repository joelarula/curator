import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

/**
 * Saves a unique address to the database as a Resource and creates a Relation.
 */
export async function persistAddress(
    args: { address: string, context?: string }, 
    prisma: PrismaClient, 
    userId: string,
    responseId: string
) {
    const { address, context } = args;
    if (!address) throw new Error("Missing required argument: address");

    console.log(`[Tools] Executing persist_address for: "${address}"`);

    // Normalize address for URI to ensure uniqueness (simple slugify)
    const normalizedAddress = address.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const uri = `address:${normalizedAddress}`;

    // 1. Ensure ResourceType 'LOCATION' exists
    let locationType = await prisma.resourceType.findUnique({ where: { name: 'LOCATION' } });
    if (!locationType) {
        locationType = await prisma.resourceType.create({ data: { name: 'LOCATION' } });
    }

    // 2. Find or create the Address Resource
    let addressResource = await prisma.resource.findUnique({ where: { uri } });
    if (!addressResource) {
        addressResource = await prisma.resource.create({
            data: {
                uri,
                title: address,
                description: context ?? null,
                resourceTypeId: locationType.id,
                userId,
                isPublished: false,
            }
        });
        console.log(`[Tools] Created new Address Resource ID: ${addressResource.id}`);
    } else {
        console.log(`[Tools] Found existing Address Resource ID: ${addressResource.id}`);
    }

    // 3. Ensure a Property Resource exists for the relation predicate (e.g. "extracted_address")
    let predicate = await prisma.resource.findUnique({ where: { uri: 'property:extracted_address' } });
    if (!predicate) {
        let propertyType = await prisma.resourceType.findUnique({ where: { name: 'PROPERTY' } });
        if (!propertyType) propertyType = await prisma.resourceType.create({ data: { name: 'PROPERTY' } });

        predicate = await prisma.resource.create({
            data: {
                uri: 'property:extracted_address',
                title: 'Extracted Address',
                resourceTypeId: propertyType.id,
                userId,
                isPublished: true,
            }
        });
    }

    // 4. Create a Relation linking the Response context to this Address.
    // For this simple agent, the "Subject" will be the user's root namespace or 
    // a placeholder agent resource, since we don't have the original source URL resource passed down cleanly yet.
    // Let's create an "Agent Context" resource to act as the subject.
    let subject = await prisma.resource.findUnique({ where: { uri: 'context:agent-scheduler' } });
    if (!subject) {
        let entityType = await prisma.resourceType.findUnique({ where: { name: 'ENTITY' } });
        if (!entityType) entityType = await prisma.resourceType.create({ data: { name: 'ENTITY' } });

        subject = await prisma.resource.create({
            data: {
                uri: 'context:agent-scheduler',
                title: 'Agent Scheduler Context',
                resourceTypeId: entityType.id,
                userId,
                isPublished: false,
            }
        });
    }

    // Ensure the triple doesn't already exist
    const existingRelation = await prisma.relation.findFirst({
        where: {
            subjectId: subject.id,
            predicateId: predicate.id,
            objectId: addressResource.id,
        }
    });

    if (!existingRelation) {
        await prisma.relation.create({
            data: {
                resourceTypeId: predicate.resourceTypeId!,
                subjectId: subject.id,
                predicateId: predicate.id,
                objectId: addressResource.id,
                responseId,
            }
        });
        console.log(`[Tools] Created RDF triple: [Agent Context] -> [Extracted Address] -> [${address}]`);
    } else {
        console.log(`[Tools] RDF triple already exists.`);
    }
}
