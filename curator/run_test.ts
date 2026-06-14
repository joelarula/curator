import { provisionSqliteDb } from './src/db/sqliteProvisioner.js';
import { run } from './scripts/test_adk_processor.js';

async function main() {
  console.log('[Runner] Starting...');
  const prisma = await provisionSqliteDb('test_adk', true);
  try {
    await run({ prisma, dbName: 'test_adk' });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
