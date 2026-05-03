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
    const { agentId, userId, templateId, name } = workerData;
    console.log(`[Worker - ${name}] Waking up to process agent ${agentId}`);

    try {
        const dbTemplate = await prisma.promptTemplate.findUnique({ where: { id: templateId } });
        if (!dbTemplate) {
            throw new Error(`PromptTemplate ${templateId} not found`);
        }

        // Create the Conversation and Prompt
        const conversation = await prisma.conversation.create({ data: {} });
        const prompt = await prisma.prompt.create({
            data: {
                uri: `prompt:agent-${agentId}-${Date.now()}`,
                templateId: dbTemplate.id,
                userId,
                prompt: dbTemplate.prompt,
                toolCalls: dbTemplate.toolCalls ? (dbTemplate.toolCalls as Prisma.InputJsonValue) : Prisma.DbNull,
            }
        });

        // Create a NEW Request for the RequestProcessor to pick up
        await prisma.request.create({
            data: {
                status: 'NEW',
                promptId: prompt.id,
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
