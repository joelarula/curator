import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from 'pg';
const { Pool } = pkg;
import { curatorEngine, CuratorRequestProcessor } from '@curator/agent-server';
import { pokerPlugin } from './index.js';
import { run as runPokerScript } from './scripts/expressive_poker.js';

// 1. Register the plugin BEFORE engine initialization
curatorEngine.registerPlugin(pokerPlugin);

async function main() {
  console.log('[Poker CLI] Initializing Poker Game Engine...');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool as any);
  const prisma = new PrismaClient({ adapter });

  try {
    // 2. Setup user context
    const user = await prisma.user.findFirst({ where: { username: 'system' } }) || await prisma.user.findFirst();
    const project = await prisma.project.findFirst({ where: { name: 'System Project' } }) || await prisma.project.findFirst();
    
    if (!user || !project) {
        throw new Error('Database not seeded!');
    }

    // 3. Create a BRAND NEW conversation for this game instance
    const conversation = await prisma.conversation.create({ data: { userId: user.id } });

    // 4. Generate the game AST (which will scope its subscriptions to this conversation)
    const ast = await runPokerScript({ prisma, conversationId: conversation.id });

    // 5. Create the root request for the engine

    const request = await prisma.request.create({
      data: {
        userId: user.id,
        projectId: project.id,
        conversationId: conversation.id,
        toolName: 'AST_Root',
        ast: ast as any,
        status: 'NEW'
      }
    });

    console.log(`[Poker CLI] Spawned game engine request ${request.id}. Processing...`);

    // 5. Run the engine!
    const processor = new CuratorRequestProcessor(prisma);
    await processor.start(1000); // Poll every 1s for new background agent events

    console.log('[Poker CLI] Game engine running in background!');
    // Real interactive CLI would intercept WAITING_FOR_USER here, but for now we just let it run.
  } catch (err) {
    console.error(err);
  }
}

main().catch(console.error);
