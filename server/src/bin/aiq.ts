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

    try {
        const body = await fs.readFile(scriptPath, 'utf8');
        console.log(`[AIQ] Executing script: ${scriptPath}`);

        // 1. Resolve a user (required for requests)
        const user = await prisma.user.findFirst();
        if (!user) throw new Error('No user found in database.');

        // 2. Evaluate the script to get toolCalls
        const toolCalls = await ScriptRunner.evaluate(body, scriptArgs, prisma, user.id);

        // 3. Create a Request
        // We also need a conversation
        let conversation = await prisma.conversation.findFirst({ where: { userId: user.id } });
        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: { userId: user.id }
            });
        }

        const request = await prisma.request.create({
            data: {
                userId: user.id,
                conversationId: conversation.id,
                toolCalls: toolCalls,
                status: 'WAITING'
            }
        });

        console.log(`[AIQ] Created request ${request.id}. Processing...`);

        // 4. Process the request immediately
        await (processor as any).processRequest(request);

        console.log(`[AIQ] Request ${request.id} completed.`);
    } catch (error: any) {
        console.error(`[AIQ] Error: ${error.message}`);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
