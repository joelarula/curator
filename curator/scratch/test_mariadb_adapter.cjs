const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const mariadb = require('mariadb');

async function test() {
  console.log('Testing PrismaMariaDb adapter with newly generated client...');
  const pool = mariadb.createPool({
    host: '192.168.1.110',
    port: 3306,
    user: 'curator',
    password: 'curator_secret',
    database: 'curator',
    connectionLimit: 5,
  });

  const adapter = new PrismaMariaDb(pool);
  const { PrismaClient } = require('../src/generated/prisma-mariadb/index.js');
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
    console.log('Successfully connected to MariaDB curator database!');
    const count = await prisma.tool.count();
    console.log('Tool count in MariaDB:', count);

    // Upsert system user and project
    const user = await prisma.user.upsert({
      where: { email: 'system@local' },
      update: {},
      create: { id: '1', name: 'System User', email: 'system@local' }
    });
    console.log('System user ready in MariaDB:', user);

    const project = await prisma.project.upsert({
      where: { id: '1' },
      update: {},
      create: { id: '1', name: 'Keeris', userId: user.id }
    });
    console.log('Project ready in MariaDB:', project);

    await prisma.$disconnect();
    console.log('Test completed with 100% success!');
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await pool.end();
  }
}

test();
