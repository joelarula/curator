/**
 * Side B: User CLI Chat Client
 *
 * An interactive command-line interface run by the human user.
 * It connects to the SQLite database, discovers requests in `WAITING_FOR_USER`
 * state, prompts the human in the terminal, submits responses to the queue,
 * and displays results as the agent computes them in the background daemon.
 *
 * Run this in a separate terminal:
 *   npm run chat
 */

import readline from 'node:readline';
import { createBlueprintHost } from '../src/host.js';

async function main() {
  console.log('====================================================');
  console.log('  👤 Curator User CLI Client');
  console.log('  Communicating with Background Dialog Agent');
  console.log('====================================================\n');

  // 1. Connect to host database (without starting a background processor)
  const host = await createBlueprintHost();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = (query: string): Promise<string> =>
    new Promise((resolve) => rl.question(query, resolve));

  console.log('[CLI Client] Searching for active agent conversations...');

  let isRunning = true;
  let lastSeenResponseId: number = 0;

  // Initialize lastSeenResponseId with current max ID
  const latestExisting = await host.prisma.response.findFirst({
    orderBy: { id: 'desc' },
  });
  if (latestExisting) {
    lastSeenResponseId = latestExisting.id;
  }

  try {
    while (isRunning) {
      // Find any request currently waiting for user input
      let waitingReq = await host.prisma.request.findFirst({
        where: { status: 'WAITING_FOR_USER' },
        orderBy: { updatedAt: 'desc' },
      });

      if (!waitingReq) {
        process.stdout.write('\r[CLI Client] Waiting for agent prompt... ');
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }

      process.stdout.write('\r                                        \r');
      const promptText =
        (waitingReq.ast as any)?.prompt || 'Please enter your message:';

      console.log(`\n🤖 Agent [Req #${waitingReq.id}]:\n   ${promptText}\n`);
      const userInput = await promptUser('👤 You > ');

      if (!userInput.trim()) continue;

      // Submit user response
      const userResp = await host.prisma.response.create({
        data: {
          requestId: waitingReq.id,
          conversationId: waitingReq.conversationId,
          userId: waitingReq.userId,
          projectId: waitingReq.projectId,
          content: JSON.stringify({ output: userInput.trim() }),
        },
      });
      lastSeenResponseId = userResp.id;

      if (
        userInput.trim().toLowerCase() === 'exit' ||
        userInput.trim().toLowerCase() === 'quit'
      ) {
        console.log('\n[CLI Client] Exiting chat session. Goodbye!');
        isRunning = false;
        break;
      }

      console.log('⏳ Processing turn...');

      // Wait for the agent daemon to produce a new response or advance state
      let turnDone = false;
      const startTime = Date.now();

      while (!turnDone && Date.now() - startTime < 15000) {
        await new Promise((r) => setTimeout(r, 400));

        // Check for new responses generated after user's response
        const newResponses = await host.prisma.response.findMany({
          where: {
            conversationId: waitingReq.conversationId,
            id: { gt: lastSeenResponseId },
          },
          orderBy: { id: 'asc' },
        });

        for (const resp of newResponses) {
          lastSeenResponseId = resp.id;
          try {
            const parsed = JSON.parse(resp.content);
            console.log(`\n📊 [Agent Output]:`, JSON.stringify(parsed, null, 2));
          } catch {
            console.log(`\n📊 [Agent Output]:`, resp.content);
          }
        }

        // Check if next turn is already waiting or completed
        const updatedReq = await host.prisma.request.findUnique({
          where: { id: waitingReq.id },
        });

        if (
          updatedReq &&
          (updatedReq.status === 'COMPLETED' ||
            updatedReq.status === 'ERROR' ||
            updatedReq.status === 'WAITING_FOR_USER')
        ) {
          turnDone = true;
          if (updatedReq.status === 'COMPLETED') {
            console.log(`\n🏁 Workflow #${updatedReq.id} has completed.`);
          }
        }
      }
    }
  } finally {
    rl.close();
    await host.stop();
  }
}

main().catch((err) => {
  console.error('[CLI Client] Fatal error:', err);
  process.exit(1);
});
