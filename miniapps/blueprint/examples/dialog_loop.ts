/**
 * Example: Running an Interactive Dialog Loop in the Blueprint MiniApp
 *
 * This example:
 * 1. Boots the Curator host with SQLite.
 * 2. Seeds the tools and dialog_playground agent.
 * 3. Triggers the dialog_playground workflow.
 * 4. Simulates a conversation turn by providing user input and reading the response.
 */

import { createBlueprintHost } from '../src/host.js';

async function main() {
  console.log('--- [Example 1: Interactive Dialog Loop] ---');

  // 1. Boot host
  const host = await createBlueprintHost();
  await host.start(1000);

  // 2. Ensure database is seeded
  console.log('Seeding agent workflows...');
  await host.seed();

  // 3. Trigger the dialog playground agent
  console.log('Triggering "dialog_playground" agent...');
  const request = await host.triggerAgent('dialog_playground');
  console.log(`Request #${request.id} created. Status: ${request.status}`);

  // 4. Poll until the request prompts for human input
  console.log('Waiting for agent prompt...');
  let waitingReq: any = null;
  for (let i = 0; i < 20; i++) {
    waitingReq = await host.prisma.request.findFirst({
      where: { id: request.id, status: 'WAITING_FOR_USER' },
    });
    if (waitingReq) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (waitingReq) {
    console.log(`\n🤖 Agent prompted: "${(waitingReq.ast as any).prompt}"`);
    console.log('Simulating user reply: "45"...');

    // 5. Submit user response into the conversation
    await host.prisma.response.create({
      data: {
        requestId: waitingReq.id,
        conversationId: waitingReq.conversationId,
        userId: waitingReq.userId,
        projectId: waitingReq.projectId,
        content: JSON.stringify({ output: '45' }),
      },
    });

    console.log('User reply submitted. Waiting for turn calculation...');
    await new Promise((r) => setTimeout(r, 2000));

    // 6. Check the latest response
    const latestResponses = await host.prisma.response.findMany({
      where: { conversationId: waitingReq.conversationId },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    console.log('\n--- Turn Completed ---');
    for (const resp of latestResponses) {
      console.log(`Response #${resp.id}:`, resp.content);
    }
  }

  await host.stop();
  console.log('\nHost stopped cleanly.');
}

main().catch((err) => {
  console.error('Example failed:', err);
  process.exit(1);
});
