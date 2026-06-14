#!/usr/bin/env tsx
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { provisionSqliteDb } from '../db/sqliteProvisioner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import fs from 'node:fs';

// Resolve project root dynamically by walking up until we find package.json
let root = __dirname;
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

// Map GOOGLE_API_KEY to what @google/adk expectations (GEMINI_API_KEY or GOOGLE_GENAI_API_KEY)
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
  .option('--reset', 'Force reset (delete) the SQLite database before running', false)
  .action(async (scriptPath: string, options: { db: string; reset: boolean }) => {
    // 1. Provision / connect database
    const prisma = await provisionSqliteDb(options.db, options.reset);

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
      const scriptUrl = pathToFileURL(importPath).href;
      console.log(`[CLI Debug] Importing: ${scriptUrl}...`);
      const scriptModule = await import(scriptUrl);
      console.log(`[CLI Debug] Script imported successfully.`);

      // Check if it exports a run function
      if (typeof scriptModule.run === 'function') {
        console.log(`[CLI] Executing exported run() function...`);
        const result = await scriptModule.run({ prisma, dbName: options.db });
        
        if (result && typeof result === 'object' && result.type) {
          console.log(`[CLI] Script returned an AST. Submitting as a new Request...`);
          
          const user = await prisma.user.upsert({
            where: { id: 'cli_user' },
            update: {},
            create: { id: 'cli_user', name: 'CLI User', email: 'cli@example.com' }
          });

          const session = await prisma.adkSession.upsert({
            where: { id_appName_userId: { id: 'cli_session', appName: 'cli', userId: user.id } },
            update: {},
            create: { id: 'cli_session', appName: 'cli', userId: user.id, state: {} }
          });

          const req = await prisma.request.create({
            data: {
              userId: user.id,
              sessionId: session.id,
              appName: session.appName,
              status: 'NEW',
              toolName: 'ADK_Workflow',
              ast: result
            }
          });

          console.log(`[CLI] Request ${req.id} enqueued. Starting local AdkRequestProcessor worker...`);

          const { AdkRequestProcessor } = await import('../engine/AdkRequestProcessor.js');
          const processor = new AdkRequestProcessor(prisma);
          await processor.start(1000);

          process.stdout.write(`[CLI] Polling for completion...`);
          while (true) {
            const check = await prisma.request.findUnique({ where: { id: req.id } });
            if (check?.status === 'COMPLETED' || check?.status === 'FAILED' || check?.status === 'SKIPPED') {
              const response = await prisma.response.findFirst({ where: { requestId: req.id }});
              console.log(`\n\n--- Execution Finished [${check.status}] ---`);
              if (response) {
                 console.log(`Response: ${response.content}`);
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
      await prisma.$disconnect();
      // Clean up temporary compiled file if created
      if (tempMjs && fs.existsSync(tempMjs)) {
        fs.unlinkSync(tempMjs);
      }
    }
  });

program.parseAsync(process.argv);
