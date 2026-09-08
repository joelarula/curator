import { createRequire } from 'node:module';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const require = createRequire(import.meta.url);
let PrismaClient;
try {
  ({ PrismaClient } = await import('../../server/node_modules/.prisma/client/index.js'));
} catch {
  ({ PrismaClient } = await import('@prisma/client'));
}

async function test() {
  const url = 'postgresql://curator:curator_secret@192.168.1.110:5432/curator';
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const user = await prisma.user.upsert({
    where: { email: 'system@local' },
    update: {},
    create: { id: '1', name: 'System User', email: 'system@local' }
  });
  console.log('✓ System User:', user.name);

  const project = await prisma.project.upsert({
    where: { id: '1' },
    update: {},
    create: { id: '1', name: 'Keeris', userId: user.id }
  });
  console.log('✓ System Project:', project.name);

  let conversation = await prisma.conversation.findFirst({
    where: { userId: user.id, projectId: project.id }
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { userId: user.id, projectId: project.id }
    });
  }
  console.log('✓ Conversation ID:', conversation.id);

  await prisma.$disconnect();
}

test().catch(console.error);
