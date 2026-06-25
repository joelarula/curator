import { PrismaClient } from '@prisma/client';

async function run() {
  process.env.DATABASE_URL = 'file:../data/test_db_human.db';
  const prisma = new PrismaClient();
  
  const waitingReq = await prisma.request.findFirst({
    where: { status: 'WAITING_FOR_USER' }
  });

  if (waitingReq) {
    console.log('🤖 Found waiting request. Inserting human response...');
    await prisma.response.create({
      data: {
        requestId: waitingReq.id,
        conversationId: waitingReq.conversationId,
        userId: waitingReq.userId,
        projectId: waitingReq.projectId,
        content: JSON.stringify({ output: "CODE-12345" })
      }
    });
    console.log('🤖 Inserted human response!');
  } else {
    console.log('🤖 No WAITING_FOR_USER request found.');
  }
  
  await prisma.$disconnect();
}

run();
