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

  // Seed ResourceStatus
  await prisma.resourceStatus.createMany({
    data: [
      { name: 'DRAFT' },
      { name: 'PENDING_REVIEW' },
      { name: 'ACTIVE' },
      { name: 'ARCHIVED' },
    ],
    skipDuplicates: true,
  })

  // Seed ResourceType
  await prisma.resourceType.createMany({
    data: [
      { name: 'ENTITY' },
      { name: 'PROPERTY' },
      { name: 'CLASS' },
      { name: 'URL' },
      { name: 'LOCATION' },
      { name: 'FEED' },
    ],
    skipDuplicates: true,
  })

  // Seed Languages
  await prisma.language.createMany({
    data: [
      { code: 'et', name: 'Estonian' },
      { code: 'en', name: 'English' }
    ],
    skipDuplicates: true,
  })

  const archivedStatus = await prisma.resourceStatus.findUnique({ where: { name: 'ARCHIVED' } });
  const classType = await prisma.resourceType.findUnique({ where: { name: 'CLASS' } });
  
  const { udcCategories } = await import('./seedData/udcCategories.js');
  
  console.log(`[Seed] Seeding ${udcCategories.length} UDC categories into Lookup table...`);
  
  await prisma.udcLookup.createMany({
    data: udcCategories.map((cat: any) => ({
      notation: cat.notation,
      uri: cat.uri,
      title: cat.title,
      enLabel: cat.enLabel,
      etLabel: cat.etLabel,
      parentUri: cat.parentUri,
      treeStart: cat.treeStart,
      treeEnd: cat.treeEnd,
      depth: cat.depth
    })),
    skipDuplicates: true
  });

  console.log('[Seed] UDC lookup seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  })
