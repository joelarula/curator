#!/usr/bin/env tsx
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ScriptRunner } from '../services/ScriptRunner.js';
import { RequestProcessor } from '../services/RequestProcessor.js';
import pkg from 'pg';
const { Pool } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';

import { AIQ, AIQBuilder } from '../services/AIQ.js';

async function main() {
    const args = process.argv.slice(2);


    if (args.length === 0) {
        console.error('Usage: aiq <script-file.aiq> [args...]');
        process.exit(1);
    }

    const scriptPath = path.resolve(args[0]!);
    const scriptArgsStr = args.slice(1).join(' ');
    let scriptArgs: any = args.slice(1); // Default to array of strings
    
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
        await import(pathToFileURL(scriptPath).href);
        
        console.log(`[AIQ] Script imported. Root chains:`, (AIQ as any).rootChains.length);



        // 3. Resolve Conversation
        let conversation = await prisma.conversation.findFirst({ where: { userId: user.id } });
        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: { userId: user.id }
            });
        }

        // 4. Execute the primary chain
        const chains = (AIQ as any).rootChains as AIQBuilder[];
        if (chains.length === 0) {
            console.log("[AIQ] No chains were started in the script.");
            return;
        }

        // Pick the first builder that actually has calls
        const primaryBuilder = chains.find(c => c.toJSON().length > 0) || chains[chains.length - 1];
        const toolCalls = primaryBuilder!.toJSON();
        
        if (toolCalls.length === 0) {
            return;
        }

        
        // Create the root request to drive the pipeline
        const request = await prisma.request.create({
            data: {
                userId: user.id,
                conversationId: conversation.id,
                toolName: toolCalls[0].name,
                toolArgs: toolCalls[0].args ?? null,
                toolCalls: toolCalls, // Full chain for orchestration
                status: 'NEW',
                executionScheduled: toolCalls[0].executionScheduled || null
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
        process.exit(1);
    } finally {
        await prisma.$disconnect();
        await pool.end();
        console.log(`[AIQ] Cleanup complete. Exiting.`);
        process.exit(0);
    }
}

main();
