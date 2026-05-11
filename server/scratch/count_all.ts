
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
    const tables = ['user', 'resource', 'text', 'relation', 'agent', 'script', 'request', 'conversation', 'resourceTree', 'udcLookup'];
    for (const table of tables) {
      const count = await (prisma as any)[table].count();
      console.log(`${table}: ${count}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
