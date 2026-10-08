/**
 * Example: Natural CoffeeScript Verbs & Automatic AST Compilation
 *
 * Demonstrates:
 * 1. Authoring a workflow in clean, punctuation-free CoffeeScript verbs (`seq`, `tool`, `assign`, `set_state`).
 * 2. Compiling the CoffeeScript source into the formal Execution AST via `compileCoffeeScriptToAST()`.
 * 3. Persisting both the source CoffeeScript (`Script.body`) and compiled AST (`Script.ast`) into SQLite.
 * 4. Executing the workflow on the Curator Host and inspecting the output.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCoffeeScriptToAST } from '../../../curator/dist/src/index.js';
import { createBlueprintHost } from '../src/host.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('====================================================');
  console.log('  ☕ Curator CoffeeScript Verbs & AST Pipeline');
  console.log('====================================================\n');

  // 1. Read the natural CoffeeScript source file
  const coffeeFilePath = path.join(__dirname, 'coffeescript_pipeline.coffee');
  const coffeeSource = fs.readFileSync(coffeeFilePath, 'utf-8');

  console.log('📄 [1. Natural CoffeeScript Source Code]:');
  console.log('----------------------------------------------------');
  console.log(coffeeSource.trim());
  console.log('----------------------------------------------------\n');

  // 2. Compile CoffeeScript into Formal Execution AST
  console.log('⚙️  [2. Compiling CoffeeScript to Formal Execution AST]...');
  const compiledAst = await compileCoffeeScriptToAST(coffeeSource);

  console.log('\n🌳 [Generated Formal Execution AST JSON]:');
  console.log(JSON.stringify(compiledAst, null, 2));

  // 3. Boot Curator Host with SQLite
  console.log('\n🚀 [3. Booting Host & Seeding into Database]...');
  const host = await createBlueprintHost();
  await host.start(500);

  const agentName = 'coffee_natural_agent';

  // Ensure system user & project exist
  const user = await host.prisma.user.upsert({
    where: { email: 'system@local' },
    update: {},
    create: { id: '1', name: 'System User', email: 'system@local' },
  });

  const project = await host.prisma.project.upsert({
    where: { id: '1' },
    update: {},
    create: { id: '1', name: 'System Project', userId: user.id },
  });

  // Save Script with raw CoffeeScript body and compiled AST JSON
  const script = await host.prisma.script.upsert({
    where: { name: agentName },
    update: {
      body: coffeeSource,
      ast: compiledAst as any,
      userId: user.id,
      projectId: project.id,
    },
    create: {
      name: agentName,
      body: coffeeSource,
      ast: compiledAst as any,
      userId: user.id,
      projectId: project.id,
    },
  });

  // Save Agent referencing the script
  await host.prisma.agent.upsert({
    where: { name: agentName },
    update: {
      scriptId: script.id,
      userId: user.id,
      projectId: project.id,
      enabled: true,
    },
    create: {
      name: agentName,
      scriptId: script.id,
      userId: user.id,
      projectId: project.id,
      enabled: true,
    },
  });

  console.log(`✅ Script & Agent "${agentName}" saved to SQLite database.`);

  // 4. Trigger and execute workflow
  console.log(`\n▶️  [4. Triggering Agent "${agentName}"]...`);
  const request = await host.triggerAgent(agentName);
  console.log(`Request #${request.id} queued. Waiting for execution...`);

  let completedReq: any = null;
  for (let i = 0; i < 20; i++) {
    completedReq = await host.prisma.request.findUnique({
      where: { id: request.id },
    });
    if (completedReq && (completedReq.status === 'COMPLETED' || completedReq.status === 'ERROR')) {
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  // 5. Inspect database results
  console.log(`\nExecution finished with status: ${completedReq?.status}`);

  const responses = await host.prisma.response.findMany({
    where: { requestId: request.id },
    orderBy: { id: 'asc' },
  });

  console.log(`\nGenerated ${responses.length} response(s) in database:`);
  for (const resp of responses) {
    console.log(`Response #${resp.id}:`, resp.content);
  }

  await host.stop();
  console.log('\nHost stopped cleanly.');
}

main().catch((err) => {
  console.error('CoffeeScript verbs example failed:', err);
  process.exit(1);
});
