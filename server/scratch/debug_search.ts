import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool as any);
  const prisma = new PrismaClient({ adapter });

  try {
    const resources = await prisma.resource.findMany({
      where: {
        OR: [
          { title: { contains: 'ilm', mode: 'insensitive' } },
          { uri: { contains: 'ilm', mode: 'insensitive' } },
          { description: { contains: 'ilm', mode: 'insensitive' } }
        ]
      },
      include: { user: true }
    });
    console.log('Found resources matching "ilm":', JSON.stringify(resources, null, 2));
    
    const allCount = await prisma.resource.count({ where: { existent: true } });
    console.log('Total existent resources:', allCount);

    const first5 = await prisma.resource.findMany({ take: 5, where: { existent: true } });
    console.log('First 5 resources:', JSON.stringify(first5, null, 2));

  } finally {
    await prisma.$disconnect();
  }
}

main();
