import { workerData, parentPort } from 'worker_threads';
import { PrismaClient, Prisma } from '@prisma/client';

import pkg from 'pg';
const { Pool } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';

dotenv.config();

// Initialize a new PrismaClient with the pg adapter for this worker thread
const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function run() {
    const { agentId, userId, scriptId, name } = workerData;
    console.log(`[Worker - ${name}] Waking up to process agent ${agentId}`);

    try {
        const dbScript = await prisma.script.findUnique({ where: { id: scriptId } });
        if (!dbScript) {
            throw new Error(`Script ${scriptId} not found`);
        }

        // Create the Conversation and Request
        const conversation = await prisma.conversation.create({ data: { userId } });
        
        // Extract toolName if present
        const toolCallsArray = dbScript.toolCalls as any[];
        const primaryToolName = Array.isArray(toolCallsArray) && toolCallsArray.length > 0 ? toolCallsArray[0].name : null;

        // Create a NEW Request for the RequestProcessor to pick up
        await prisma.request.create({
            data: {
                status: 'NEW',
                toolName: primaryToolName,
                scriptId: dbScript.id,
                userId,
                toolCalls: dbScript.toolCalls ? (dbScript.toolCalls as Prisma.InputJsonValue) : Prisma.DbNull,
                conversationId: conversation.id,
            }
        });

        // Update last polled timestamp
        await prisma.agent.update({
            where: { id: agentId },
            data: { lastPolledAt: new Date() }
        });

        console.log(`[Worker - ${name}] Successfully queued request.`);
    } catch (error) {
        console.error(`[Worker - ${name}] Error executing agent job:`, error);
    } finally {
        await prisma.$disconnect();
        // Signal to Bree that the job is done
        if (parentPort) parentPort.postMessage('done');
        else process.exit(0);
    }
}

run();
