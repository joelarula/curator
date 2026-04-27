const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Testing topic.findMany()...');
    const topics = await prisma.topic.findMany({
        take: 1
    });
    console.log('Success:', topics);
  } catch (error) {
    console.error('Error details:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
