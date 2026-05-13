#!/usr/bin/env tsx
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { RequestProcessor } from '../services/RequestProcessor.js';
import pkg from 'pg';
const { Pool } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { Command } from 'commander';

import { AIQ, AIQBuilder } from '../services/AIQ.js';

const program = new Command();

program
  .name('aiq')
  .description('Curator AIQ Script Executor')
  .version('1.0.0')
  .argument('<script>', 'Path to the AIQ script file (.ts or .js)')
  .argument('[args...]', 'Arguments passed to the script')
  .action(async (scriptArg, argsArg) => {
      const scriptPath = path.resolve(scriptArg);
      const scriptArgsStr = argsArg.join(' ');
      let scriptArgs: any = argsArg; // Default to array of strings
      
      // Try to parse JSON args if provided and it looks like an object/array
      if (scriptArgsStr.trim().startsWith('{') || scriptArgsStr.trim().startsWith('[')) {
          try {
              scriptArgs = JSON.parse(scriptArgsStr);
          } catch (e) {
              console.warn('[AIQ] Failed to parse JSON args, using as raw strings.');
          }
      }

      const connectionString = process.env.DATABASE_URL!;
      const pool = new Pool({ connectionString });
      const adapter = new PrismaPg(pool as any);
      const prisma = new PrismaClient({ adapter });
      const processor = new RequestProcessor(prisma);
      processor.isAdHoc = true;

      try {
          // 1. Resolve a user (required for requests)
          const user = await prisma.user.findFirst();
          if (!user) throw new Error('No user found in database.');

          // 2. Evaluate the script
          // Use pathToFileURL for Windows absolute path compatibility
          (AIQ as any).setArgs(scriptArgs, scriptArgsStr);
          console.log(`[AIQ] Global state set:`, JSON.stringify((global as any).__AIQ_STATE__));
          
          const { pathToFileURL } = await import('node:url');
          const imported = await import(pathToFileURL(scriptPath).href);
          
          console.log(`[AIQ] Script imported. Root chains:`, (AIQ as any).rootChains.length);

          // 3. Resolve Conversation
          let conversation = await prisma.conversation.findFirst({ where: { userId: user.id } });
          if (!conversation) {
              conversation = await prisma.conversation.create({
                  data: { userId: user.id }
              });
          }

          // 4. Resolve the AST to execute
          let ast: any = null;

          // Option A: Check if the script explicitly exported a Pipeline instance
          for (const val of Object.values(imported)) {
              if (val && typeof val === 'object' && 'toAST' in val && typeof (val as any).toAST === 'function') {
                  ast = (val as any).toAST();
                  break;
              }
          }

          // Option B: Fallback to the implicit legacy AIQBuilder chains
          if (!ast) {
              const chains = (AIQ as any).rootChains as AIQBuilder[];
              if (chains.length > 0) {
                  const primaryBuilder = chains.find(c => c.toJSON() !== null) || chains[chains.length - 1];
                  ast = primaryBuilder?.toJSON();
              }
          }

          if (!ast) {
              console.log("[AIQ] No valid workflow or chain was found in the script.");
              return;
          }

          // Create the root request to drive the pipeline
          const request = await prisma.request.create({
              data: {
                  userId: user.id,
                  conversationId: conversation.id,
                  toolName: 'AST_Root',
                  ast: ast, // Full AST for orchestration
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
          console.log(`----------------------`);
          console.log(`[AIQ] Script execution finished.`);
      } catch (error: any) {
          console.error(`[AIQ] Error: ${error.message}`);
          process.exitCode = 1;
      } finally {
          await prisma.$disconnect();
          await pool.end();
          console.log(`[AIQ] Cleanup complete. Exiting.`);
          process.exit();
      }
  });

program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
});
