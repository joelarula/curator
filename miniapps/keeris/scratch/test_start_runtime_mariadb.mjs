import { openDatabase } from '../src/db.ts';
import { startCuratorRuntime } from '../src/curator-runtime.ts';

async function test() {
  process.env.CURATOR_DATABASE_URL = 'mysql://curator:curator_secret@192.168.1.110:3306/curator';
  process.env.DATABASE_URL = 'mysql://curator:curator_secret@192.168.1.110:3306/keeris';

  console.log('[Test] Opening Keeris database...');
  const keerisDb = openDatabase();

  console.log('[Test] Starting Curator runtime with MariaDB...');
  const runtime = await startCuratorRuntime({
    databaseName: 'keeris',
    keerisDb,
    intervalMs: 5000,
  });

  console.log('[Test] Counting agents in MariaDB curator database...');
  const agents = await runtime.prisma.agent.findMany();
  console.log(`[Test] Found ${agents.length} agents in MariaDB curator database:`, agents.map(a => a.name));

  const tools = await runtime.prisma.tool.findMany();
  console.log(`[Test] Found ${tools.length} tools in MariaDB curator database:`, tools.map(t => t.name));

  const requests = await runtime.prisma.request.count();
  console.log(`[Test] Found ${requests} requests in MariaDB curator database.`);

  await runtime.stop();
  await keerisDb.close();
  console.log('✓ Curator MariaDB runtime test passed!');
}

test().catch(console.error);
