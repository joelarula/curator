#!/usr/bin/env tsx
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { RequestProcessor } from '../services/RequestProcessor.js';
import pkg from 'pg';
const { Pool } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { Command } from 'commander';

import { Curator, CuratorBuilder } from '../services/Curator.js';

const program = new Command();

// Base program configuration
program
  .name('curator')
  .description('Curator Script Executor')
  .version('1.0.0');

// -------------------------------------------------------------------
// Sub-command: `curator help`
// -------------------------------------------------------------------
program
  .command('help')
  .description('Display usage information')
  .action(() => {
    program.help();
  });

// -------------------------------------------------------------------
// Sub-command: `curator run <script> [args...]`
// -------------------------------------------------------------------
program
  .command('run')
  .description('Execute a Curator script (.ts, .js, .coffee, .yaml)')
  .argument('<script>', 'Path to the Curator script file')
  .argument('[args...]', 'Optional arguments passed to the script')
  .option('--db <name>', 'Use a named local SQLite database (auto-provisioned if new)')
  .option('--reset', 'Force reset (delete) the SQLite database before running the script')
  .action(async (scriptArg: string, argsArg: string[], opts: { db?: string; reset?: boolean }) => {
    const scriptPath = path.resolve(scriptArg);
    const scriptArgsStr = argsArg.join(' ');
    let scriptArgs: any = argsArg;

    // Try to parse JSON args if provided and it looks like an object/array
    if (scriptArgsStr.trim().startsWith('{') || scriptArgsStr.trim().startsWith('[')) {
      try {
        scriptArgs = JSON.parse(scriptArgsStr);
      } catch {
        console.warn('[Curator] Failed to parse JSON args, using as raw strings.');
      }
    }

    // ------------------------------------------------------------------
    // Database connection — SQLite (--db) or PostgreSQL (default)
    // ------------------------------------------------------------------
    let prisma: PrismaClient;
    let pool: InstanceType<typeof Pool> | null = null;

    if (opts.db) {
      const { provisionSqliteDb } = await import('./sqliteProvisioner.js');
      prisma = await provisionSqliteDb(opts.db, opts.reset);
    } else {
      console.log(`[Curator] Connecting to PostgreSQL...`);
      const connectionString = process.env.DATABASE_URL!;
      pool = new Pool({ connectionString });
      const adapter = new PrismaPg(pool as any);
      prisma = new PrismaClient({ adapter });
    }

    const processor = new RequestProcessor(prisma);
    processor.isAdHoc = true;

    try {
      console.log(`[Curator] Resolving user...`);
      const user = await prisma.user.findFirst();
      if (!user) throw new Error('No user found in database.');
      console.log(`[Curator] User resolved: ${user.id}`);

      console.log(`[Curator] Importing script: ${scriptPath}`);
      (Curator as any).setArgs(scriptArgs, scriptArgsStr);

      // Resolve or create a conversation
      let conversation = await prisma.conversation.findFirst({ where: { userId: user.id } });
      if (!conversation) {
        conversation = await prisma.conversation.create({ data: { userId: user.id } });
      }

      // Resolve the AST to execute
      let ast: any = null;

      const isCffe = scriptPath.endsWith('.coffee') || scriptPath.endsWith('.yaml') || scriptPath.endsWith('.yml');
      if (isCffe) {
        const fs = await import('node:fs');
        const { ScriptRunner } = await import('../services/ScriptRunner.js');
        const fileContent = fs.readFileSync(scriptPath, 'utf-8');
        ast = await ScriptRunner.evaluate(fileContent, scriptArgs, prisma, user.id);
      } else {
        const { pathToFileURL } = await import('node:url');
        const imported = await import(pathToFileURL(scriptPath).href);
        console.log(`[Curator] Script imported. Root chains:`, (Curator as any).rootChains.length);

        // Option A: script explicitly exported a Pipeline instance
        for (const val of Object.values(imported)) {
          if (val && typeof val === 'object' && 'toAST' in val && typeof (val as any).toAST === 'function') {
            ast = (val as any).toAST();
            break;
          }
        }

        // Option B: fallback to implicit legacy CuratorBuilder chains
        if (!ast) {
          const chains = (Curator as any).rootChains as CuratorBuilder[];
          if (chains.length > 0) {
            const primaryBuilder = chains.find(c => c.toJSON() !== null) || chains[chains.length - 1];
            ast = primaryBuilder?.toJSON();
          }
        }
      }

      if (!ast) {
        console.log('[Curator] No valid workflow or chain was found in the script.');
        return;
      }

      // Create the root request to drive the pipeline
      const request = await prisma.request.create({
        data: {
          userId: user.id,
          conversationId: conversation.id,
          toolName: 'AST_Root',
          ast: ast,
          status: 'NEW'
        }
      });

      await processor.processRequest(request);

      // Fetch the final response
      const response = await prisma.response.findFirst({
        where: { requestId: request.id },
        orderBy: { createdAt: 'desc' }
      });
      const lastResult = response?.content;

      console.log(`--- SCRIPT RETURN ---`);
      console.log(JSON.stringify(lastResult, null, 2));
      console.log(`---------------------`);
      console.log(`[Curator] Script execution finished.`);
    } catch (error: any) {
      console.error(`[Curator] Error: ${error.message}`);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
      if (pool) await pool.end();
      console.log(`[Curator] Cleanup complete. Exiting.`);
      process.exit();
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
