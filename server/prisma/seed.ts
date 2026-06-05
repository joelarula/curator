import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { VOCAB } from '../src/constants/vocabulary.js';
import { ensureSystemProject } from '../src/services/ProjectScopeService.js';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

import { syncAIModelsToDatabase } from '../src/services/AIModelRegistry.js';

async function seedSystemVocabulary(systemUserId: string, systemProjectId: string) {
  const commonResources = [
    { uri: VOCAB.RDF.type, title: 'rdf:type' },
    { uri: VOCAB.PROP.status, title: 'prop:status' },
    { uri: VOCAB.PROP.inLanguage, title: 'prop:inLanguage' },
    { uri: VOCAB.PROP.allowsValue, title: 'prop:allows_value' },
    { uri: VOCAB.TYPE.predicate, title: 'type:predicate' },
    { uri: VOCAB.STATUS.draft, title: 'status:draft' },
    { uri: VOCAB.STATUS.published, title: 'status:published' },
    { uri: VOCAB.STATUS.archived, title: 'status:archived' },
    { uri: VOCAB.STATUS.flagged, title: 'status:flagged' },
    { uri: VOCAB.LANGUAGES.english, title: 'lang:en' },
    { uri: VOCAB.LANGUAGES.estonian, title: 'lang:et' },
    { uri: VOCAB.LANGUAGES.russian, title: 'lang:ru' },
  ];

  const resourceByUri = new Map<string, { id: number; uri: string }>();
  const commonUris = new Set(commonResources.map((resource) => resource.uri));

  for (const resource of commonResources) {
    const upserted = await prisma.resource.upsert({
      where: { uri: resource.uri },
      update: {
        title: resource.title,
        existent: true,
        deletedAt: null,
        projectId: systemProjectId,
      },
      create: {
        uri: resource.uri,
        title: resource.title,
        userId: systemUserId,
        projectId: systemProjectId,
        existent: true,
        deletedAt: null,
      },
      select: { id: true, uri: true },
    });

    resourceByUri.set(upserted.uri, upserted);
  }

  const relationTriples = [
    [VOCAB.RDF.type, VOCAB.RDF.type, VOCAB.TYPE.predicate],
    [VOCAB.PROP.status, VOCAB.RDF.type, VOCAB.TYPE.predicate],
    [VOCAB.PROP.inLanguage, VOCAB.RDF.type, VOCAB.TYPE.predicate],
    [VOCAB.PROP.allowsValue, VOCAB.RDF.type, VOCAB.TYPE.predicate],

    [VOCAB.PROP.status, VOCAB.PROP.allowsValue, VOCAB.STATUS.draft],
    [VOCAB.PROP.status, VOCAB.PROP.allowsValue, VOCAB.STATUS.published],
    [VOCAB.PROP.status, VOCAB.PROP.allowsValue, VOCAB.STATUS.archived],
    [VOCAB.PROP.status, VOCAB.PROP.allowsValue, VOCAB.STATUS.flagged],

    [VOCAB.PROP.inLanguage, VOCAB.PROP.allowsValue, VOCAB.LANGUAGES.english],
    [VOCAB.PROP.inLanguage, VOCAB.PROP.allowsValue, VOCAB.LANGUAGES.estonian],
    [VOCAB.PROP.inLanguage, VOCAB.PROP.allowsValue, VOCAB.LANGUAGES.russian],
  ] as const;

  for (const [subjectUri, predicateUri, objectUri] of relationTriples) {
    const subject = resourceByUri.get(subjectUri);
    const predicate = resourceByUri.get(predicateUri);
    const object = resourceByUri.get(objectUri);
    if (!subject || !predicate || !object) continue;

    await prisma.relation.upsert({
      where: {
        subjectId_predicateId_objectId: {
          subjectId: subject.id,
          predicateId: predicate.id,
          objectId: object.id,
        },
      },
      update: {
        projectId: systemProjectId,
        existent: true,
      },
      create: {
        subjectId: subject.id,
        predicateId: predicate.id,
        objectId: object.id,
        projectId: systemProjectId,
        existent: true,
      },
    });
  }

  const statusPredicate = resourceByUri.get(VOCAB.PROP.status);
  const draftStatus = resourceByUri.get(VOCAB.STATUS.draft);
  const publishedStatus = resourceByUri.get(VOCAB.STATUS.published);

  if (statusPredicate && draftStatus && publishedStatus) {
    const existingResources = await prisma.resource.findMany({
      where: {
        existent: true,
        uri: { notIn: Array.from(commonUris) },
      },
      select: {
        id: true,
        isPublished: true,
        projectId: true,
      },
    });

    let backfilled = 0;
    for (const resource of existingResources) {
      const targetStatusId = resource.isPublished ? publishedStatus.id : draftStatus.id;
      const existingStatusRelation = await prisma.relation.findFirst({
        where: {
          subjectId: resource.id,
          predicateId: statusPredicate.id,
          objectId: targetStatusId,
          existent: true,
        },
        select: { id: true },
      });

      if (existingStatusRelation) continue;

      await prisma.relation.create({
        data: {
          subjectId: resource.id,
          predicateId: statusPredicate.id,
          objectId: targetStatusId,
          projectId: resource.projectId || systemProjectId,
          existent: true,
        },
      });
      backfilled += 1;
    }

    console.log(`[Seed] Backfilled ${backfilled} resource status relations.`);
  }

  console.log(`[Seed] System vocabulary synced: ${commonResources.length} resources, ${relationTriples.length} relations.`);
}

async function main() {
  // 1. Sync AI Models from Registry
  await syncAIModelsToDatabase(prisma);
  const { systemUser, systemProject } = await ensureSystemProject(prisma);

  console.log(`[Seed] System Project initialized with ID: ${systemProject.id}`);

  // 2. Seed globally shared vocabulary into the system project.
  await seedSystemVocabulary(systemUser.id, systemProject.id);




  const { udcCategories } = await import('./seedData/udcCategories.js');

  console.log(`[Seed] Seeding ${udcCategories.length} UDC categories to dedicated Lookup Table...`);

  // We process in chunks to avoid overwhelming the DB
  const BATCH_SIZE = 500;
  for (let i = 0; i < udcCategories.length; i += BATCH_SIZE) {
    const batch = udcCategories.slice(i, i + BATCH_SIZE);
    
    const data = batch
      .map((cat: any) => {
        const uri = cat.uri || null;
        const notation = cat.notation || null;
        const title = cat.etLabel || cat.title || cat.enLabel || notation || 'Unnamed Category';

        if (!uri || !notation) {
          console.warn(`[Seed] Skipping UDC item due to missing URI/Notation:`, JSON.stringify(cat));
          return null;
        }

        return {
          uri,
          notation: notation.substring(0, 45),
          parentUri: (cat.parentUri || '').substring(0, 250) || null,
          title: title.substring(0, 250),
          enLabel: (cat.enLabel || cat.title || '').substring(0, 250) || null,
          etLabel: (cat.etLabel || '').substring(0, 250) || null,
          treeStart: cat.treeStart ?? 0,
          treeEnd: cat.treeEnd ?? 0,
          depth: cat.depth ?? 0,
        };
      })

      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (data.length > 0) {
      try {
        await prisma.udcLookup.createMany({
          data,
          skipDuplicates: true
        });
      } catch (batchError) {
        console.warn(`[Seed] Batch failure at index ${i}. Falling back to individual upserts for diagnostics...`);
        for (const item of data) {
          try {
            await prisma.udcLookup.upsert({
              where: { uri: item.uri },
              update: item,
              create: item
            });
          } catch (itemError) {
            console.error(`[Seed] Individual item failed! Record:`, JSON.stringify(item));
            console.error(`[Seed] Error detail:`, itemError);
            throw itemError;
          }
        }
      }
    }
  }

  console.log('[Seed] Unified Resource Graph seeding complete.');
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  })
