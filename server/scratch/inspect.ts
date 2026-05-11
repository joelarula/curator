
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
  
  const args = process.argv.slice(2);
  const table = args[0] || 'resource';

  try {
    console.log(`Inspecting table: ${table}`);
    const data = await (prisma as any)[table].findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: table === 'request' || table === 'resource' || table === 'agent' ? { user: true } : undefined
    });
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
