const { openDatabase } = require('../src/db.ts');
const { startCuratorRuntime } = require('../src/curator-runtime.ts');

async function test() {
  process.env.CURATOR_DATABASE_URL = 'mysql://curator:curator_secret@192.168.1.110:3306/curator';
  process.env.DATABASE_URL = 'mysql://curator:curator_secret@192.168.1.110:3306/keeris';

  console.log('Opening Keeris database...');
  const keerisDb = openDatabase();

  console.log('Starting Curator runtime with MariaDB...');
  const runtime = await startCuratorRuntime({
    databaseName: 'keeris',
    keerisDb,
    intervalMs: 5000,
  });

  console.log('Counting agents in MariaDB curator database...');
  const agents = await runtime.prisma.agent.findMany();
  console.log(`Found ${agents.length} agents in MariaDB curator database:`, agents.map(a => a.name));

  const tools = await runtime.prisma.tool.count();
  console.log(`Found ${tools} tools in MariaDB curator database.`);

  const requests = await runtime.prisma.request.count();
  console.log(`Found ${requests} requests in MariaDB curator database.`);

  await runtime.stop();
  await keerisDb.close();
  console.log('✓ Curator MariaDB runtime test passed!');
}

test().catch(console.error);
