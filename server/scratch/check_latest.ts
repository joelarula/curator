import { PrismaClient } from '@prisma/client';
import pkg from 'pg';
const { Pool } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

async function main() {
  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool as any);
  const prisma = new PrismaClient({ adapter });

  try {
    const latestTexts = await prisma.text.findMany({
      take: 5,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        resource: true
      }
    });

    console.log(`Latest 5 texts:`);
    for (const t of latestTexts) {
      console.log(`- ID: ${t.id}, Resource URI: ${t.resource?.uri}, CreatedAt: ${t.createdAt}`);
      console.log(`  Content snippet: ${t.content.substring(0, 100)}...`);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
