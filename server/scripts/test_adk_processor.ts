import { PrismaClient } from '@prisma/client';
import { AdkRequestProcessor } from '../../curator/src/engine/AdkRequestProcessor.js';

export async function run() {
  console.log(`[Script] Testing AdkRequestProcessor from server`);

  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.upsert({
      where: { id: 'default_user' },
      update: {},
      create: { id: 'default_user', name: 'Default User', email: 'default@example.com' }
    });

    // Use an existing conversation for the test to avoid schema validation issues
    let conversation = await prisma.conversation.findFirst();
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          user: { connect: { id: user.id } }
        } as any
      });
    }

    // Insert a dummy request with ADK AST
    const req = await prisma.request.create({
      data: {
        userId: user.id,
        conversationId: conversation.id,
        status: 'NEW',
        toolName: 'ADK_Workflow',
        ast: {
          type: 'ADK_Agent',
          agentName: 'TestAgent',
          prompt: 'Say "Hello, ADK!" and nothing else.',
          model: 'gemini-2.0-flash'
        }
      }
    });

    console.log(`[Script] Created test request ${req.id}`);

    const processor = new AdkRequestProcessor(prisma);
    processor.start(2000); // Poll every 2 seconds

    // Wait a bit to let it process
    console.log('[Script] Waiting 15 seconds for processor to pick up and execute...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    processor.stop();

    // Check the response
    const response = await prisma.response.findFirst({
      where: { requestId: req.id }
    });

    const finalReq = await prisma.request.findUnique({ where: { id: req.id }});

    console.log(`\n--- Test Results ---`);
    console.log(`Request Status: ${finalReq?.status}`);
    console.log(`Response Content: ${response?.content}`);
    console.log(`--------------------\n`);
  } finally {
    await prisma.$disconnect();
  }
}

// Run it directly
if (process.argv[1] && process.argv[1].includes('test_adk_processor.ts')) {
  run().catch(console.error);
}
