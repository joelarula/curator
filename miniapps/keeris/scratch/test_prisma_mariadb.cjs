const { PrismaClient } = require('@prisma/client');

async function test() {
  process.env.DATABASE_URL = 'mysql://curator:curator_secret@192.168.1.110:3306/curator';
  try {
    const prisma = new PrismaClient();
    console.log('PrismaClient instantiated. Connecting...');
    await prisma.$connect();
    console.log('Connected!');
    await prisma.$disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
