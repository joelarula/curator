/**
 * Example: Triggering and Executing a CoffeeScript Agent Pipeline
 *
 * This example:
 * 1. Boots the Curator Host with SQLite.
 * 2. Seeds the domain tools and agents (including `coffee_evaluator`).
 * 3. Triggers the `coffee_evaluator` agent workflow.
 * 4. Waits for the Request Processor to compile CoffeeScript on-the-fly and execute the pipeline.
 * 5. Inspects the final structured result in the database.
 */

import { createBlueprintHost } from '../src/host.js';

async function main() {
  console.log('--- [Example 3: CoffeeScript Agent Execution] ---');

  // 1. Boot host with request polling
  const host = await createBlueprintHost();
  await host.start(1000);

  // 2. Ensure database is seeded
  console.log('Seeding agent workflows and plugins...');
  await host.seed();

  // 3. Trigger CoffeeScript evaluator agent
  console.log('Triggering "coffee_evaluator" agent...');
  const request = await host.triggerAgent('coffee_evaluator');
  console.log(`Request #${request.id} created. Initial status: ${request.status}`);

  // 4. Poll until the request reaches a terminal status
  console.log('Waiting for CoffeeScript pipeline execution...');
  let completedReq: any = null;
  for (let i = 0; i < 20; i++) {
    completedReq = await host.prisma.request.findUnique({
      where: { id: request.id },
    });
    if (completedReq && (completedReq.status === 'COMPLETED' || completedReq.status === 'ERROR')) {
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // 5. Output results
  console.log(`\nExecution finished with status: ${completedReq?.status}`);

  const responses = await host.prisma.response.findMany({
    where: { requestId: request.id },
    orderBy: { id: 'asc' },
  });

  console.log(`\nGenerated ${responses.length} response(s):`);
  for (const resp of responses) {
    console.log(`Response #${resp.id}:`, resp.content);
  }

  // 6. Stop host cleanly
  await host.stop();
  console.log('\nHost stopped cleanly.');
}

main().catch((err) => {
  console.error('CoffeeScript example failed:', err);
  process.exit(1);
});
