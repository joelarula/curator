import { Runner } from '@google/adk';
import { PrismaSessionService } from './sessions/PrismaSessionService.js';
import type { BaseAgent } from '@google/adk';

export * from './db/sqliteProvisioner.js';
export * from './sessions/PrismaSessionService.js';
export * from './engine/AdkRequestProcessor.js';

const APP_NAME = 'CuratorAgentCLI';

export interface ExecuteAgentOptions {
  prisma: any;
  agent: BaseAgent;
  prompt: string;
  /** ADK user identifier — defaults to 'default_user' */
  userId?: string;
  /** ADK session identifier — auto-generated if not provided */
  sessionId?: string;
}

export async function executeAgent(options: ExecuteAgentOptions): Promise<string> {
  const {
    prisma,
    agent,
    prompt,
    userId = 'default_user',
    sessionId = `session_${Math.random().toString(36).substring(2, 11)}`
  } = options;

  // Initialize ADK session service backed by Prisma
  const sessionService = new PrismaSessionService(prisma);

  // Ensure a session exists for this run
  await sessionService.createSession({
    appName: APP_NAME,
    userId,
    sessionId
  });

  const runner = new Runner({
    appName: APP_NAME,
    agent,
    sessionService
  });

  // Run the agent and collect the final text response.
  // We iterate all events and keep the last non-empty text from a non-user author.
  // Tool-call events have functionCall parts (no text), which we skip automatically.
  const responseGenerator = runner.runAsync({
    userId,
    sessionId,
    newMessage: { parts: [{ text: prompt }] }
  });

  let lastText = '';
  for await (const event of responseGenerator) {
    if (!event.content?.parts || event.author === 'user') continue;

    const parts = event.content.parts as Array<{ text?: string }>;
    const text = parts
      .filter((p) => typeof p.text === 'string' && p.text.trim().length > 0)
      .map((p) => p.text as string)
      .join('');

    if (text) {
      lastText = text;
    }
  }

  return lastText;
}
