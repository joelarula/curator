#!/usr/bin/env tsx
console.log('[CLI Bootstrap] Booting...');
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import fs from 'node:fs';

// Resolve project root dynamically by walking up until we find package.json
let root = path.join(__dirname, '..', '..');
while (root !== path.dirname(root)) {
  if (fs.existsSync(path.join(root, 'package.json'))) {
    break;
  }
  root = path.dirname(root);
}
const projectRoot = root;

// Load local .env first so SQLite DATABASE_URL wins over root PostgreSQL one
dotenv.config({ path: path.join(projectRoot, '.env'), override: true });
// Load root .env as fallback for other vars (GOOGLE_API_KEY etc.)
dotenv.config({ path: path.resolve(projectRoot, '../.env') });

// Ensure @google/genai can find the key under any env var name
if (process.env.GOOGLE_API_KEY) {
  if (!process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = process.env.GOOGLE_API_KEY;
  if (!process.env.GOOGLE_GENAI_API_KEY) process.env.GOOGLE_GENAI_API_KEY = process.env.GOOGLE_API_KEY;
}

const program = new Command();

program
  .name('curator-agent')
  .description('Curator Agent Runner CLI')
  .version('1.0.0');

program
  .command('run')
  .description('Run an agent script')
  .argument('<script>', 'Path to the agent script (.ts, .js, or .coffee)')
  .option('--db <name>', 'Database name to use/provision', 'default')
  .option('--session <name>', 'Session ID to use (auto-generated UUID if omitted)')
  .option('--reset', 'Force reset (delete) the SQLite database before running', false)
  .action(async (scriptPath: string, options: { db: string; session: string; reset: boolean }) => {
    // Ensure heavy dependencies are imported dynamically inside the action block 
    // to prevent Node from performing 30+ seconds of synchronous stat calls on network drives during bootstrap.
    const { curatorEngine } = await import('../engine/CuratorEngine.js');
    const { curatorContext } = await import('../engine/CuratorContext.js');
    const { corePlugin } = await import('../plugins/core/index.js');
    const { provisionSqliteDb } = await import('../db/sqliteProvisioner.js');
    
    curatorEngine.registerPlugin(corePlugin);

    // 1. Provision / connect database
    const prisma = await provisionSqliteDb(options.db, options.reset);

    const { randomUUID } = await import('node:crypto');
    options.session = options.session || randomUUID();
    console.log(`[CLI] Using Session ID: ${options.session}`);

    // 2. Resolve and (optionally) compile the script
    const absoluteScriptPath = path.resolve(scriptPath);
    console.log(`[CLI] Running script: ${absoluteScriptPath} on database: ${options.db}`);

    let importPath = absoluteScriptPath;
    let tempMjs: string | null = null;

    if (absoluteScriptPath.endsWith('.coffee')) {
      console.log(`[CLI] CoffeeScript detected — compiling...`);
      const coffee = (await import('coffeescript')).default;
      const source = fs.readFileSync(absoluteScriptPath, 'utf8');
      // Compile to JS; CoffeeScript 2 preserves import/export keywords → valid ESM
      const js = coffee.compile(source, { bare: false, header: false });
      tempMjs = absoluteScriptPath.replace(/\.coffee$/, '.compiled.mjs');
      fs.writeFileSync(tempMjs, js, 'utf8');
      importPath = tempMjs;
      console.log(`[CLI] Compiled to: ${tempMjs}`);
    }

    try {
      const { pathToFileURL } = await import('node:url');
      
      // If we are running the compiled version from dist/src/bin/cli.js or bundle.cjs
      // we need to dynamically map .ts script paths to their compiled .js equivalents in dist/scripts/
      const currentFilePath = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
      if (currentFilePath.includes(path.join('dist', 'src', 'bin')) || currentFilePath.endsWith('cli.bundle.cjs')) {
        const relativeToRoot = path.relative(root, importPath);
        importPath = path.join(root, 'dist', relativeToRoot.replace(/\.ts$/, '.js'));
        console.log(`[CLI Debug] Mapped TypeScript script to compiled path: ${importPath}`);
      }

      const scriptUrl = pathToFileURL(importPath).href;
      console.log(`[CLI Debug] Importing: ${scriptUrl}...`);
      const scriptModule = await import(scriptUrl);
      console.log(`[CLI Debug] Script imported successfully.`);

      // Check if it exports a run function
      if (typeof scriptModule.run === 'function') {
        console.log(`[CLI] Executing exported run() function...`);
        let result: any;
        
        await curatorContext.run({
          userId: 2, // CLI User
          projectId: 1, // System Project
          userIds: [2],
          projectIds: [1],
          sessionId: options.session,
          prisma
        }, async () => {
          result = await scriptModule.run({ prisma, dbName: options.db });
        });
        
        if (result && typeof result === 'object' && result.type) {
          console.log(`[CLI] Script returned an AST. Submitting as a new Request...`);
          
          const user = await prisma.user.upsert({
            where: { id: 2 },
            update: {},
            create: { id: 2, username: 'cli_user', name: 'CLI User', email: 'cli@example.com' }
          });

          const conversation = await prisma.conversation.upsert({
            where: { id: options.session },
            update: {},
            create: { id: options.session, userId: user.id }
          });

          const req = await prisma.request.create({
            data: {
              userId: user.id,
              conversationId: conversation.id,
              status: 'NEW',
              toolName: 'Curator_Workflow',
              ast: result
            }
          });

          console.log(`[CLI] Request ${req.id} enqueued. Starting local CuratorRequestProcessor worker...`);

          const { CuratorRequestProcessor } = await import('../engine/CuratorRequestProcessor.js');
          const processor = new CuratorRequestProcessor(prisma);
          await processor.start(1000);

          process.stdout.write(`[CLI] Polling for completion...`);
          while (true) {
            const pending = await prisma.request.count({
              where: { conversationId: options.session, status: { in: ['NEW', 'WAITING'] }, id: { gte: req.id } }
            });
            
            if (pending === 0) {
              const response = await prisma.response.findFirst({ 
                where: { conversationId: options.session, requestId: { gte: req.id } }, 
                orderBy: { createdAt: 'desc' } 
              });
              
              console.log(`\n\n--- Execution Finished ---`);
              if (response) {
                 try {
                   const parsed = JSON.parse(response.content);
                   console.log(`Response:\n${JSON.stringify(parsed, null, 2)}`);
                 } catch (e) {
                   console.log(`Response:\n${response.content}`);
                 }
              }
              processor.stop();
              break;
            }
            process.stdout.write('.');
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      } else {
        console.warn(`[CLI] Warning: No run() function exported by ${scriptPath}. Doing nothing.`);
      }
    } catch (error: any) {
      console.error(`[CLI] Error running script:`, error);
      process.exit(1);
    } finally {
      // Clean up temporary compiled file if created
      if (tempMjs && fs.existsSync(tempMjs)) {
        fs.unlinkSync(tempMjs);
      }
      // Force exit without waiting for Prisma to disconnect, as active 
      // async processor loops might cause disconnect to hang indefinitely
      process.exit(0);
    }
  });

program
  .command('serve')
  .description('Start the background worker daemon for Request processing and Agent scheduling')
  .option('--db <name>', 'Database name to use/provision', 'default')
  .action(async (options: { db: string }) => {
    const { provisionSqliteDb } = await import('../db/sqliteProvisioner.js');
    const prisma = await provisionSqliteDb(options.db, false);
    
    console.log(`[CLI] Starting background workers...`);
    
    // 1. Start Curator Request Processor
    const { CuratorRequestProcessor } = await import('../engine/CuratorRequestProcessor.js');
    const processor = new CuratorRequestProcessor(prisma);
    await processor.start(1000);
    
    // 2. Start Agent Scheduler
    const { AgentScheduler } = await import('../engine/AgentScheduler.js');
    const scheduler = new AgentScheduler(prisma);
    await scheduler.start();

    // Keep process alive
    process.on('SIGINT', async () => {
      console.log(`\n[CLI] Shutting down workers...`);
      processor.stop();
      await scheduler.stop();
      await prisma.$disconnect();
      process.exit(0);
    });
  });

program.parseAsync(process.argv).catch((error) => {
  console.error('[CLI] Fatal Error:', error);
  process.exit(1);
});
