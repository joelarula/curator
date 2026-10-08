/**
 * Side A: Dialog Agent Daemon Process
 *
 * Runs the Curator Host and RequestProcessor in the background.
 * It listens for and processes agent workflows (e.g. `dialog_playground`),
 * handling state, calculating tool steps, and pausing whenever human input is required.
 *
 * Run this in one terminal:
 *   npm run agent:dialog
 */

import { createBlueprintHost } from '../src/host.js';

async function main() {
  console.log('====================================================');
  console.log('  🤖 Curator Dialog Agent Daemon');
  console.log('  Mode: Background RequestProcessor & Host');
  console.log('====================================================\n');

  // 1. Boot host & start request processor loop (every 500ms)
  const host = await createBlueprintHost();
  await host.start(500);

  // 2. Ensure tools & agents are seeded
  console.log('[Agent Daemon] Synchronizing tools and workflows...');
  await host.seed();

  // 3. Subscribe to real-time status changes
  host.events.on('request:status_changed', (event: any) => {
    const { requestId, status } = event.payload || {};
    if (status === 'WAITING_FOR_USER') {
      console.log(`\n⏸️  [Agent Daemon] Request #${requestId} is WAITING_FOR_USER (Ready for CLI client input)`);
    } else if (status === 'COMPLETED') {
      console.log(`\n✅ [Agent Daemon] Request #${requestId} COMPLETED`);
    } else if (status === 'PROCESSING') {
      console.log(`\n⚙️  [Agent Daemon] Request #${requestId} PROCESSING turn...`);
    }
  });

  // 4. Trigger the dialog playground agent workflow
  console.log('[Agent Daemon] Triggering "dialog_playground" agent session...');
  const request = await host.triggerAgent('dialog_playground');
  console.log(`[Agent Daemon] Active conversation: ${request.conversationId}`);
  console.log(`[Agent Daemon] Agent loop is running. Open another terminal and run:\n  👉 npm run chat\n`);

  // Handle graceful termination
  const shutdown = async () => {
    console.log('\n[Agent Daemon] Shutting down host...');
    await host.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Agent Daemon] Fatal error:', err);
  process.exit(1);
});
