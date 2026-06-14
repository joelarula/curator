import { type PrismaClient } from '@prisma/client';
import { AdkRequestProcessor } from '../src/engine/AdkRequestProcessor.js';

export async function run({ prisma, dbName }: { prisma: PrismaClient; dbName: string }) {
  console.log(`[Script] Executing script on database: ${dbName}`);

  // Return the AST directly so the CLI can enqueue and poll it
  return {
    type: 'ADK_Agent',
    agentName: 'TestAgent',
    prompt: 'Say "Hello, ADK CLI!" and nothing else.',
    model: 'gemini-1.5-flash'
  };
}
