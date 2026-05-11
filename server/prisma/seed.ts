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

  // Seed lookup tables
  await prisma.textRole.createMany({
    data: [
      { name: 'MAIN' },
      { name: 'SUMMARY' },
      { name: 'TRANSCRIPT' },
    ],
    skipDuplicates: true,
  })

  const { udcCategories } = await import('./seedData/udcCategories.js');

  
  console.log(`[Seed] Migrating ${udcCategories.length} UDC categories to Unified Resource Graph...`);

  // We process in chunks to avoid overwhelming the DB
  const BATCH_SIZE = 500;
  for (let i = 0; i < udcCategories.length; i += BATCH_SIZE) {
    const batch = udcCategories.slice(i, i + BATCH_SIZE);
    
    // 1. Create Resources
    await prisma.resource.createMany({
      data: batch.map((cat: any) => ({
        uri: cat.uri,
        title: cat.etLabel || cat.title,
        notation: cat.notation,
        description: cat.enLabel || null,
        userId: curator.id,
        isPublished: true,
        deletedAt: null
      })),
      skipDuplicates: true
    });

    // 2. Fetch created IDs to build the Tree
    const createdResources = await prisma.resource.findMany({
      where: { uri: { in: batch.map((c: any) => c.uri) } },
      select: { id: true, uri: true }
    });
    const uriToId = new Map(createdResources.map(r => [r.uri, r.id]));

    // 3. Create ResourceTree nodes
    await prisma.resourceTree.createMany({
      data: batch.map((cat: any) => ({
        treeName: 'UDC',
        resourceId: uriToId.get(cat.uri)!,
        treeStart: cat.treeStart,
        treeEnd: cat.treeEnd,
        depth: cat.depth,
        deletedAt: null
      })),
      skipDuplicates: true
    });
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
