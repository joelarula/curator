const mariadb = require('mariadb');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { PrismaClient } = require('../../../curator/src/generated/prisma-mariadb/index.js');
const { CuratorRequestProcessor, curatorEngine } = require('../../../curator/dist/src/index.js');
const { registerKeerisPlugins } = require('../dist/plugins/index.js'); // or we test direct

async function test() {
  const pool = mariadb.createPool({
    host: '192.168.1.110',
    port: 3306,
    user: 'curator',
    password: 'curator_secret',
    database: 'curator',
    connectionLimit: 5,
  });

  const adapter = new PrismaMariaDb(pool);
  const prisma = new PrismaClient({ adapter });
  const processor = new CuratorRequestProcessor(prisma);

  console.log('Testing syncToolsToDb()...');
  await processor.syncToolsToDb();
  console.log('✓ syncToolsToDb() completed with no errors!');

  console.log('Testing syncAgentsToDb()...');
  await processor.syncAgentsToDb();
  console.log('✓ syncAgentsToDb() completed with no errors!');

  const tools = await prisma.tool.count();
  const agents = await prisma.agent.count();
  console.log(`MariaDB now has ${tools} tools and ${agents} agents!`);

  await prisma.$disconnect();
  await pool.end();
}

test().catch(console.error);
