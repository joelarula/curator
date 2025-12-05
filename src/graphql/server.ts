import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function bootstrap() {
  console.log('GraphQL server is currently disabled due to Prisma migration.');
}

bootstrap().catch(console.error);