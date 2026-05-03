import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function main() {
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  })
