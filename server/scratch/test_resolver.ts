import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { resourceResolvers } from '../src/resolvers/resources.js';

dotenv.config();

async function testResolver() {
  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool as any);
  const prisma = new PrismaClient({ adapter });

  const context = {
    prisma,
    user: { id: 'cmp1pm1k60000acwd0atv24p9' } // Mock user
  };

  console.log('--- TESTING RESOURCE RESOLVER (ID: 947) ---');
  try {
    const result = await resourceResolvers.Query.resource(null, { id: 947 }, context);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Resolver error:', err);
  }
  
  await prisma.$disconnect();
}

testResolver();
