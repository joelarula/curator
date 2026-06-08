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
import { seedPredicates } from '../src/services/PredicateService.js';
import { SemanticDslEngine } from '../src/services/SemanticDslEngine.js';


async function seedSystemVocabulary(systemUserId: string, systemProjectId: string) {
  // 1. Delegate predicate seeding and mapping to PredicateService
  await seedPredicates(prisma, systemUserId, systemProjectId);

  // 2. Fetch required resources to perform backfilling
  const [statusPredicate, draftStatus, publishedStatus] = await Promise.all([
    prisma.resource.findUnique({ where: { uri: VOCAB.PROP.status }, select: { id: true } }),
    prisma.resource.findUnique({ where: { uri: VOCAB.STATUS.draft }, select: { id: true } }),
    prisma.resource.findUnique({ where: { uri: VOCAB.STATUS.published }, select: { id: true } }),
  ]);

  if (statusPredicate && draftStatus && publishedStatus) {
    const excludedUris = [
      VOCAB.RDF.type,
      VOCAB.PROP.status,
      VOCAB.PROP.inLanguage,
      VOCAB.PROP.allowsValue,
      VOCAB.STATUS.draft,
      VOCAB.STATUS.published,
      VOCAB.STATUS.archived,
      VOCAB.STATUS.flagged,
      VOCAB.LANGUAGES.english,
      VOCAB.LANGUAGES.estonian,
      VOCAB.LANGUAGES.russian,
    ];

    const existingResources = await prisma.resource.findMany({
      where: {
        existent: true,
        uri: { notIn: excludedUris },
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

  console.log(`[Seed] System vocabulary synced via PredicateService.`);
}

async function main() {
  // 1. Sync AI Models from Registry
  await syncAIModelsToDatabase(prisma);
  const { systemUser, systemProject } = await ensureSystemProject(prisma);

  console.log(`[Seed] System Project initialized with ID: ${systemProject.id}`);

  // 2. Seed globally shared vocabulary into the system project.
  await seedSystemVocabulary(systemUser.id, systemProject.id);

  // 3. Sync compiled SASL DSL Models/Ontology to the system project
  await SemanticDslEngine.getInstance(prisma).syncDslOntology(systemUser.id, systemProject.id);





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
