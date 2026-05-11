
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
    const agents = await prisma.agent.findMany();
    console.log('All Agents:', JSON.stringify(agents, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main();
No root identities established yet.