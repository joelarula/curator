import { Agent, FunctionTool } from '@google/adk';
import { executeAgent } from '../src/index.js';
import type { PrismaClient } from '@prisma/client';

export async function run({ prisma, dbName }: { prisma: PrismaClient; dbName: string }) {
  console.log(`[Script] Executing agent script using database: ${dbName}`);

  // 1. Define a simple math tool
  const calculatorTool = new FunctionTool({
    name: 'calculate_square',
    description: 'Calculate the square of a number.',
    execute: async (args: any) => {
      const result = args.value * args.value;
      console.log(`[Tool Executed] calculate_square: ${args.value} -> ${result}`);
      return { result };
    },
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'number' }
      },
      required: ['value']
    } as any
  });

  // 2. Define the ADK agent
  const agent = new Agent({
    name: 'math_agent',
    model: 'gemini-2.5-flash',
    instruction:
      'You are a math helper. You must ALWAYS use the calculate_square tool to find the square of a number. Do not calculate it yourself.',
    tools: [calculatorTool]
  });

  // 3. Run the agent
  const prompt = 'Calculate the square of 17. Use the tool.';
  const sessionId = 'test_math_session';
  const userId = 'default_user';

  console.log(`[Script] Running agent with prompt: "${prompt}"`);

  const answer = await executeAgent({
    prisma,
    agent,
    prompt,
    userId,
    sessionId
  });

  console.log(`[Script] Final Agent Answer:\n`, answer);

  // 4. Audit ADK persistence tables
  console.log(`\n[Script] Auditing ADK persistence tables...`);

  const sessions = await prisma.adkSession.findMany({
    where: { userId },
    include: { events: true }
  });

  console.log(`\n=================== ADK PERSISTENCE AUDIT ===================`);
  console.log(`Sessions found: ${sessions.length}`);

  for (const session of sessions) {
    console.log(`\n[Session] id=${session.id} app=${session.appName} user=${session.userId}`);
    console.log(`  State:`, JSON.stringify(session.state));
    console.log(`  Events (${session.events.length}):`);
    for (const ev of session.events) {
      const data = ev.eventData as any;
      console.log(`    [Event] id=${ev.id} invocation=${ev.invocationId} author=${data?.author ?? '?'}`);
      if (data?.content) {
        console.log(`      Content:`, JSON.stringify(data.content).substring(0, 120));
      }
    }
  }

  console.log(`\n=============================================================\n`);
}
