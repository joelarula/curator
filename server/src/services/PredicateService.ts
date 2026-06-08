import { PrismaClient } from '@prisma/client';
import { VOCAB } from '../constants/vocabulary.js';

export interface PredicateDefinition {
    uri: string;
    title: string;
    description: string;
    allowedValues?: string[]; // Allowed object URIs
    domainTypes?: string[];   // Types of subjects this predicate typically applies to
    rangeTypes?: string[];    // Types of objects/classes this predicate typically takes
}

export const PREDICATE_REGISTRY: PredicateDefinition[] = [
    {
        uri: VOCAB.RDF.type,
        title: 'rdf:type',
        description: 'Links an instance to a Class (e.g., type:article)',
        domainTypes: ['type:concept', 'type:article', 'type:agent'],
        rangeTypes: ['type:predicate', 'type:concept']
    },
    {
        uri: VOCAB.PROP.status,
        title: 'prop:status',
        description: 'Current workflow state of a resource',
        allowedValues: [
            VOCAB.STATUS.draft,
            VOCAB.STATUS.published,
            VOCAB.STATUS.archived,
            VOCAB.STATUS.flagged
        ],
        domainTypes: ['type:article', 'type:concept', 'type:agent'],
        rangeTypes: ['status:draft', 'status:published', 'status:archived', 'status:flagged']
    },
    {
        uri: VOCAB.PROP.inLanguage,
        title: 'prop:inLanguage',
        description: 'Primary language of the resource',
        allowedValues: [
            VOCAB.LANGUAGES.english,
            VOCAB.LANGUAGES.estonian,
            VOCAB.LANGUAGES.russian
        ],
        domainTypes: ['type:article', 'type:concept'],
        rangeTypes: ['lang:en', 'lang:et', 'lang:ru']
    },
    {
        uri: VOCAB.PROP.allowsValue,
        title: 'prop:allows_value',
        description: 'Links a predicate to its valid enum options/objects',
        domainTypes: ['type:predicate'],
        rangeTypes: ['type:concept', 'status:draft', 'status:published', 'status:archived', 'status:flagged', 'lang:en', 'lang:et', 'lang:ru']
    },
    {
        uri: VOCAB.SCHEMA.about,
        title: 'schema:about',
        description: 'Primary subject or thematic concept of the resource',
        domainTypes: ['type:article'],
        rangeTypes: ['type:concept']
    },
    {
        uri: VOCAB.SCHEMA.title,
        title: 'schema:title',
        description: 'Human-readable display title aligned with Schema.org standards',
        domainTypes: ['type:article', 'type:concept', 'type:agent']
    },
    {
        uri: VOCAB.SCHEMA.description,
        title: 'schema:description',
        description: 'Short textual description or summary aligned with Schema.org standards',
        domainTypes: ['type:article', 'type:concept', 'type:agent']
    },
    {
        uri: VOCAB.SCHEMA.provider,
        title: 'schema:provider',
        description: 'Service provider or source of the resource',
        domainTypes: ['type:article']
    },
    {
        uri: VOCAB.SCHEMA.datePublished,
        title: 'schema:datePublished',
        description: 'Publication date of the resource',
        domainTypes: ['type:article']
    },
    {
        uri: VOCAB.SCHEMA.author,
        title: 'schema:author',
        description: 'Author or creator of the resource',
        domainTypes: ['type:article'],
        rangeTypes: ['type:agent']
    },
    {
        uri: VOCAB.SCHEMA.isPartOf,
        title: 'schema:isPartOf',
        description: 'Links a sub-document or section to its containing parent document',
        domainTypes: ['type:article'],
        rangeTypes: ['type:article']
    },
    {
        uri: VOCAB.PROP.confidence,
        title: 'prop:confidence',
        description: 'AI extraction confidence score',
        domainTypes: ['type:predicate']
    },
    {
        uri: VOCAB.PROP.extractionMethod,
        title: 'prop:extraction_method',
        description: 'Method or algorithm used to extract this relation',
        domainTypes: ['type:predicate']
    },
    {
        uri: VOCAB.PROP.justification,
        title: 'prop:justification',
        description: 'AI justification explanation for this assertion',
        domainTypes: ['type:predicate']
    }
];

/**
 * Atomically creates or updates a Resource as a predicate and links it to type:predicate.
 */
export async function upsertPredicate(
    prisma: PrismaClient,
    userId: string,
    input: {
        uri: string;
        title?: string;
        description?: string;
        projectId?: string | null;
    }
) {
    const { uri, title, description, projectId = null } = input;
    const safeTitle = title || uri.substring(0, 250);

    // 1. Resolve or create the predicate resource itself
    const predicate = await prisma.resource.upsert({
        where: { uri },
        update: {
            existent: true,
            deletedAt: null,
            ...(title !== undefined && { title: safeTitle }),
            ...(description !== undefined && { description }),
            ...(projectId !== undefined && { projectId }),
        },
        create: {
            uri,
            title: safeTitle,
            description: description || null,
            userId,
            projectId,
            isPublished: false,
            existent: true,
            deletedAt: null,
        },
    });

    // 2. Ensure typePredicate and predicateClass exist
    const [typePredicate, predicateClass] = await Promise.all([
        prisma.resource.upsert({
            where: { uri: VOCAB.RDF.type },
            update: { existent: true, deletedAt: null },
            create: {
                uri: VOCAB.RDF.type,
                title: 'rdf:type',
                userId,
                projectId,
                isPublished: false,
                existent: true,
                deletedAt: null,
            },
        }),
        prisma.resource.upsert({
            where: { uri: VOCAB.TYPE.predicate },
            update: { existent: true, deletedAt: null },
            create: {
                uri: VOCAB.TYPE.predicate,
                title: 'type:predicate',
                userId,
                projectId,
                isPublished: false,
                existent: true,
                deletedAt: null,
            },
        }),
    ]);

    // 3. Link predicate to type:predicate via rdf:type
    await prisma.relation.upsert({
        where: {
            subjectId_predicateId_objectId: {
                subjectId: predicate.id,
                predicateId: typePredicate.id,
                objectId: predicateClass.id,
            },
        },
        update: {
            existent: true,
        },
        create: {
            subjectId: predicate.id,
            predicateId: typePredicate.id,
            objectId: predicateClass.id,
            projectId,
            existent: true,
        },
    });

    return predicate;
}

/**
 * Seeds all standard predicates from PREDICATE_REGISTRY into the database.
 */
export async function seedPredicates(
    prisma: PrismaClient,
    systemUserId: string,
    systemProjectId: string
) {
    console.log(`[PredicateService] Seeding ${PREDICATE_REGISTRY.length} core predicates...`);

    const resourceByUri = new Map<string, { id: number; uri: string }>();

    // 1. Seed all predicates from registry
    for (const def of PREDICATE_REGISTRY) {
        const predicate = await upsertPredicate(prisma, systemUserId, {
            uri: def.uri,
            title: def.title,
            description: def.description,
            projectId: systemProjectId,
        });
        resourceByUri.set(predicate.uri, predicate);
    }

    // 2. Ensure VOCAB.PROP.allowsValue predicate resource exists in map
    let allowsValueResource = resourceByUri.get(VOCAB.PROP.allowsValue);
    if (!allowsValueResource) {
        const p = await upsertPredicate(prisma, systemUserId, {
            uri: VOCAB.PROP.allowsValue,
            title: 'prop:allows_value',
            description: 'Links a predicate to its valid enum options/objects',
            projectId: systemProjectId,
        });
        allowsValueResource = p;
        resourceByUri.set(p.uri, p);
    }

    // 3. Seed predicate allowed values (enum values)
    for (const def of PREDICATE_REGISTRY) {
        if (!def.allowedValues || def.allowedValues.length === 0) continue;

        const predicateResource = resourceByUri.get(def.uri);
        if (!predicateResource) continue;

        for (const valUri of def.allowedValues) {
            // Resolve or create the allowed value resource as a stub
            const allowedValueResource = await prisma.resource.upsert({
                where: { uri: valUri },
                update: {
                    existent: true,
                    deletedAt: null,
                    projectId: systemProjectId,
                },
                create: {
                    uri: valUri,
                    title: valUri.substring(0, 250),
                    userId: systemUserId,
                    projectId: systemProjectId,
                    isPublished: false,
                    existent: true,
                    deletedAt: null,
                },
            });

            // Link predicate to allowed value via allowsValue
            await prisma.relation.upsert({
                where: {
                    subjectId_predicateId_objectId: {
                        subjectId: predicateResource.id,
                        predicateId: allowsValueResource.id,
                        objectId: allowedValueResource.id,
                    },
                },
                update: {
                    existent: true,
                },
                create: {
                    subjectId: predicateResource.id,
                    predicateId: allowsValueResource.id,
                    objectId: allowedValueResource.id,
                    projectId: systemProjectId,
                    existent: true,
                },
            });

            // Link allowed value back to predicate via rdf:type (Inbound / Both Ways)
            const typePredicate = resourceByUri.get(VOCAB.RDF.type);
            if (typePredicate) {
                await prisma.relation.upsert({
                    where: {
                        subjectId_predicateId_objectId: {
                            subjectId: allowedValueResource.id,
                            predicateId: typePredicate.id,
                            objectId: predicateResource.id,
                        },
                    },
                    update: {
                        existent: true,
                    },
                    create: {
                        subjectId: allowedValueResource.id,
                        predicateId: typePredicate.id,
                        objectId: predicateResource.id,
                        projectId: systemProjectId,
                        existent: true,
                    },
                });
            }
        }
    }

    console.log('[PredicateService] Core predicates seeding complete.');
}
