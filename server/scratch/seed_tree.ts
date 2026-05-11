
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
          { uri: { startsWith: 'feed:' } },
          { uri: { startsWith: 'type:' } },
          { uri: { startsWith: 'conversation:' } },
          { title: 'uudised | ERR' }
        ]
      }
    });

    console.log(`Found ${resources.length} resources to promote to root identities.`);

    for (let i = 0; i < resources.length; i++) {
      const res = resources[i];
      await prisma.resourceTree.upsert({
        where: { treeName_resourceId: { treeName: 'MAIN', resourceId: res.id } },
        update: {
            treeStart: i * 10,
            treeEnd: i * 10 + 9,
            depth: 0
        },
        create: {
          treeName: 'MAIN',
          resourceId: res.id,
          treeStart: i * 10,
          treeEnd: i * 10 + 9,
          depth: 0
        }
      });
      console.log(`Promoted ${res.title} (${res.uri}) to root.`);
    }

  } finally {
    await prisma.$disconnect();
  }
}

main();
