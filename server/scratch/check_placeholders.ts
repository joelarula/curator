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
    const problematicTexts = await prisma.text.findMany({
      where: {
        content: {
          contains: '{{toolOutputs.'
        }
      },
      include: {
        resource: true
      }
    });

    console.log(`Found ${problematicTexts.length} texts with placeholders.`);
    for (const t of problematicTexts) {
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
