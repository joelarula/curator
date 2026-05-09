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
    let scriptArgs: any = {};
    
    // Try to parse JSON args if provided
    if (scriptArgsStr.trim().startsWith('{')) {
        try {
            scriptArgs = JSON.parse(scriptArgsStr);
        } catch (e) {
            console.warn('[AIQ] Failed to parse JSON args, using as raw string.');
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
        const { pathToFileURL } = await import('node:url');
        await import(pathToFileURL(scriptPath).href);

        // 3. Resolve Conversation
        let conversation = await prisma.conversation.findFirst({ where: { userId: user.id } });
        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: { userId: user.id }
            });
        }

        // 4. Execute the primary chain (enforcing one chain per script rule)
        const chains = (AIQ as any).rootChains as AIQBuilder[];
        if (chains.length === 0) {
            console.log("[AIQ] No chains were started in the script.");
            return;
        }

        // Pick the first builder that actually has calls (skips the empty one from init())
        const primaryBuilder = chains.find(c => c.toJSON().length > 0) || chains[chains.length - 1];
        const toolCalls = primaryBuilder!.toJSON();
        let lastResult: any = null;

        for (const call of toolCalls) {
            if (call.spawn) {
                // Database flow starts here
                console.log(`[AIQ] Spawning detached request for: ${call.name}`);
                const request = await prisma.request.create({
                    data: {
                        userId: user.id,
                        conversationId: conversation.id,
                        toolName: call.name,
                        toolArgs: call.args ?? null,
                        toolCalls: [{ ...call, spawn: false }],
                        status: 'NEW'
                    }
                });
                await (processor as any).processRequest(request);
                
                const response = await prisma.response.findFirst({
                    where: { requestId: request.id },
                    orderBy: { createdAt: 'desc' }
                });
                lastResult = response?.content;
            } else {
                // Direct in-process execution
                const { executeTool } = await import('../services/Tools.js');
                console.log(`[AIQ] Executing local chain: ${call.name}`);
                
                // Mock request object for context
                const mockRequest = {
                    id: 0,
                    userId: user.id,
                    conversationId: conversation.id,
                    resourceStack: []
                };

                lastResult = await executeTool(
                    call.name, 
                    call.args, 
                    prisma, 
                    user.id, 
                    0, // responseId 0
                    mockRequest
                );
            }
        }

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
