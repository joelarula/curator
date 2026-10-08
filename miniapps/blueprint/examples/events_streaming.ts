/**
 * Example: Real-Time Event Bus & Lifecycle Streaming
 *
 * Demonstrates:
 * 1. Subscribing to typed lifecycle events emitted by the Curator Host (`host.events`).
 * 2. Wildcard listening (`*`) and topic filtering.
 * 3. Inspecting the recent event buffer (`host.events.getRecentLogs()`).
 */

import { createBlueprintHost } from '../src/host.js';

async function main() {
  console.log('--- [Example 5: Real-Time Host Event Streaming] ---');

  // 1. Boot host
  const host = await createBlueprintHost();
  await host.start(1000);

  // 2. Subscribe to event bus listeners
  const unsubscribeAll = host.events.on('*', (event: any) => {
    console.log(`📡 [BUS EVENT] Topic: "${event.topic}" | Timestamp: ${event.timestamp}`);
  });

  const unsubscribeStatus = host.events.on('request:status_changed', (event: any) => {
    console.log(`🔄 [STATUS CHANGE] Request #${event.payload.requestId} -> ${event.payload.status}`);
  });

  // 3. Seed and trigger workflows
  console.log('\nSeeding database...');
  await host.seed();

  console.log('\nTriggering "metric_calculator" agent...');
  const req = await host.triggerAgent('metric_calculator');

  // 4. Wait for workflow execution
  console.log('Awaiting completion...');
  for (let i = 0; i < 15; i++) {
    const current = await host.prisma.request.findUnique({ where: { id: req.id } });
    if (current?.status === 'COMPLETED' || current?.status === 'ERROR') {
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // 5. Inspect rolling event logs
  console.log('\n--- Recent Rolling Event Logs (Buffer: 200) ---');
  const recentLogs = host.events.getRecentLogs(5);
  for (const log of recentLogs) {
    console.log(`[${log.timestamp}] [${log.topic}]`, JSON.stringify(log.payload));
  }

  // Cleanup listeners
  unsubscribeAll();
  unsubscribeStatus();

  await host.stop();
  console.log('\nHost stopped cleanly.');
}

main().catch((err) => {
  console.error('Events streaming example failed:', err);
  process.exit(1);
});
