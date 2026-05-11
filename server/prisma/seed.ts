import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

import { syncAIModelsToDatabase } from '../src/services/AIModelRegistry.js';

async function main() {
  // 1. Sync AI Models from Registry
  await syncAIModelsToDatabase(prisma);
  // Seed application user 'curator'
  const curator = await prisma.user.upsert({
    where: { email: 'curator@arula.dev' },
    update: {},
    create: {
      email: 'curator@arula.dev',
      name: 'curator',
    },
  })


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
