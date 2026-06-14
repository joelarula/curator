/**
 * ADK Examples — @curator/agent-server
 *
 * Run any example:
 *   npx tsx src/bin/cli.ts run scripts/adk_examples.ts --db examples --reset
 *
 * Covers:
 *   1. Basic LLM Agent
 *   2. Agent with FunctionTools
 *   3. Session state (read/write across turns)
 *   4. Sequential multi-agent pipeline
 *   5. Parallel fan-out with sub-agents
 *   6. Agent-as-tool (delegation)
 *   7. Structured JSON output
 *   8. Streaming events
 */

import {
  Agent,
  Runner,
  FunctionTool,
  SequentialAgent,
  ParallelAgent,
} from '@google/adk';
import { type PrismaClient } from '@prisma/client';
import { PrismaSessionService } from '../src/sessions/PrismaSessionService.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const APP = 'CuratorAgentCLI';

async function runAgent(
  prisma: PrismaClient,
  agent: Agent | SequentialAgent | ParallelAgent,
  prompt: string,
  sessionId = `s_${Date.now()}`
): Promise<string> {
  const sessionService = new PrismaSessionService(prisma);
  await sessionService.createSession({ appName: APP, userId: 'demo', sessionId });

  const runner = new Runner({ appName: APP, agent, sessionService });
  let lastText = '';

  for await (const event of runner.runAsync({
    userId: 'demo',
    sessionId,
    newMessage: { parts: [{ text: prompt }] }
  })) {
    const text = (event.content?.parts ?? [])
      .filter((p: any) => typeof p.text === 'string' && p.text.trim())
      .map((p: any) => p.text as string)
      .join('');
    if (text) lastText = text;
  }

  return lastText;
}

// ─── EXAMPLE 1 — Basic LLM Agent ─────────────────────────────────────────────
//
//  The minimal unit. An Agent wraps a model, an instruction, and optional tools.
//  Use when: simple Q&A, classification, text generation.

async function example1_basicAgent(prisma: PrismaClient) {
  console.log('\n── Example 1: Basic LLM Agent ──────────────────────────────');

  const agent = new Agent({
    name: 'haiku_writer',
    model: 'gemini-2.5-flash',
    instruction: 'You write haikus. Respond with only the haiku, no explanations.',
  });

  const result = await runAgent(prisma, agent, 'Write a haiku about a debugger finding a bug.');
  console.log('Result:', result);
}

// ─── EXAMPLE 2 — Agent with FunctionTools ────────────────────────────────────
//
//  FunctionTool wraps any async function so the agent can call it.
//  Use when: you need live data, calculations, side effects, or external APIs.

async function example2_toolAgent(prisma: PrismaClient) {
  console.log('\n── Example 2: Agent with FunctionTools ─────────────────────');

  const getWeather = new FunctionTool({
    name: 'get_weather',
    description: 'Returns current weather for a city.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' }
      },
      required: ['city']
    } as any,
    execute: async (input: any) => {
      const { city } = input as { city: string };
      // In a real script you'd call a weather API here.
      const mock: Record<string, string> = {
        Tallinn: '18°C, partly cloudy',
        London: '14°C, rainy',
        Tokyo: '28°C, sunny',
      };
      return { city, conditions: mock[city] ?? '20°C, unknown' };
    }
  });

  const agent = new Agent({
    name: 'weather_agent',
    model: 'gemini-2.5-flash',
    instruction: 'You answer questions about the weather. Use the get_weather tool.',
    tools: [getWeather],
  });

  const result = await runAgent(prisma, agent, 'What is the weather like in Tallinn and Tokyo?');
  console.log('Result:', result);
}

// ─── EXAMPLE 3 — Session state (multi-turn) ──────────────────────────────────
//
//  The same sessionId lets the agent remember prior context.
//  Use when: chatbots, interactive workflows, user preferences.

async function example3_sessionState(prisma: PrismaClient) {
  console.log('\n── Example 3: Session State (multi-turn) ───────────────────');

  const agent = new Agent({
    name: 'memory_agent',
    model: 'gemini-2.5-flash',
    instruction: 'You are a helpful assistant. Remember what the user tells you.',
  });

  const sessionService = new PrismaSessionService(prisma);
  const sessionId = `multi_turn_${Date.now()}`;
  await sessionService.createSession({ appName: APP, userId: 'demo', sessionId });

  const runner = new Runner({ appName: APP, agent, sessionService });

  async function turn(text: string) {
    let reply = '';
    for await (const event of runner.runAsync({
      userId: 'demo', sessionId,
      newMessage: { parts: [{ text }] }
    })) {
      const t = (event.content?.parts ?? [])
        .filter((p: any) => typeof p.text === 'string')
        .map((p: any) => p.text as string).join('');
      if (t) reply = t;
    }
    return reply;
  }

  console.log('Turn 1:', await turn('My name is Joel and I like jazz.'));
  console.log('Turn 2:', await turn('What did I tell you about myself?'));
}

// ─── EXAMPLE 4 — SequentialAgent (pipeline) ──────────────────────────────────
//
//  SequentialAgent runs sub-agents one after another, passing output forward.
//  Use when: multi-step processing — extract → analyse → format.

async function example4_sequentialAgent(prisma: PrismaClient) {
  console.log('\n── Example 4: SequentialAgent (pipeline) ───────────────────');

  const extractor = new Agent({
    name: 'keyword_extractor',
    model: 'gemini-2.5-flash',
    instruction: 'Extract the 3 most important keywords from the text. Return only a comma-separated list.',
  });

  const expander = new Agent({
    name: 'keyword_expander',
    model: 'gemini-2.5-flash',
    instruction: 'Given a comma-separated list of keywords, write one sentence describing what connects them.',
  });

  const pipeline = new SequentialAgent({
    name: 'keyword_pipeline',
    subAgents: [extractor, expander],
  });

  const text = 'Estonian Public Broadcasting covers politics, culture, and weather across radio and TV.';
  const result = await runAgent(prisma, pipeline, text);
  console.log('Final output:', result);
}

// ─── EXAMPLE 5 — ParallelAgent (fan-out) ─────────────────────────────────────
//
//  ParallelAgent runs all sub-agents concurrently and merges the outputs.
//  Use when: independent analyses that can run simultaneously.

async function example5_parallelAgent(prisma: PrismaClient) {
  console.log('\n── Example 5: ParallelAgent (fan-out) ──────────────────────');

  const sentimentAgent = new Agent({
    name: 'sentiment',
    model: 'gemini-2.5-flash',
    instruction: 'Classify the sentiment: POSITIVE, NEGATIVE, or NEUTRAL. One word only.',
  });

  const languageAgent = new Agent({
    name: 'language_detector',
    model: 'gemini-2.5-flash',
    instruction: 'Detect the language of the text. Respond with just the language name.',
  });

  const summaryAgent = new Agent({
    name: 'summariser',
    model: 'gemini-2.5-flash',
    instruction: 'Summarise the text in one sentence.',
  });

  const parallel = new ParallelAgent({
    name: 'text_analyser',
    subAgents: [sentimentAgent, languageAgent, summaryAgent],
  });

  const text = 'Täna on Eestis ilus päikseline ilm ja inimesed on rõõmsad.';
  const result = await runAgent(prisma, parallel, text);
  console.log('Merged output:', result);
}

// ─── EXAMPLE 6 — Agent-as-tool (delegation) ──────────────────────────────────
//
//  An orchestrator agent can call sub-agents as tools.
//  Use when: the top-level agent needs to delegate specialised subtasks.

async function example6_agentAsTool(prisma: PrismaClient) {
  console.log('\n── Example 6: Agent-as-Tool (delegation) ───────────────────');

  // Sub-agent: only does translation
  const translator = new Agent({
    name: 'translator',
    model: 'gemini-2.5-flash',
    instruction: 'Translate the given text to English. Return only the translation.',
  });

  // The orchestrator can call translator as a tool via AgentTool
  // (AgentTool wraps an agent so it looks like a FunctionTool to the orchestrator)
  const { AgentTool } = await import('@google/adk');

  const orchestrator = new Agent({
    name: 'orchestrator',
    model: 'gemini-2.5-flash',
    instruction: `
      You coordinate translation and analysis tasks.
      Use the translator tool when text is not in English.
      Then summarise the translated content.
    `,
    tools: [new AgentTool({ agent: translator })],
  });

  const result = await runAgent(
    prisma, orchestrator,
    'Tere tulemast Eestisse! See on ilus maa kaunite looduse ja laululinnuga.'
  );
  console.log('Result:', result);
}

// ─── EXAMPLE 7 — Structured JSON output ──────────────────────────────────────
//
//  Force the model to return a specific JSON schema via output_schema.
//  Use when: downstream code needs to parse the response reliably.

async function example7_structuredOutput(prisma: PrismaClient) {
  console.log('\n── Example 7: Structured JSON output ───────────────────────');

  const agent = new Agent({
    name: 'news_classifier',
    model: 'gemini-2.5-flash',
    instruction: 'Classify news article. Respond ONLY with valid JSON matching the schema.',
    outputSchema: {
      type: 'object',
      properties: {
        category:   { type: 'string', enum: ['politics', 'culture', 'weather', 'sports', 'tech', 'other'] },
        isBreaking: { type: 'boolean' },
        sentiment:  { type: 'string', enum: ['positive', 'negative', 'neutral'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['category', 'isBreaking', 'sentiment', 'confidence']
    } as any
  });

  const headline = 'Storm warning issued for the coast of Estonia — winds expected to reach 25 m/s.';
  const result = await runAgent(prisma, agent, `Classify this headline: "${headline}"`);

  try {
    const parsed = JSON.parse(result);
    console.log('Parsed JSON:', parsed);
  } catch {
    console.log('Raw result:', result);
  }
}

// ─── EXAMPLE 8 — Streaming events ────────────────────────────────────────────
//
//  runAsync() yields events as they arrive. Inspect each event type.
//  Use when: you need real-time output, tool-call hooks, or audit logs.

async function example8_streaming(prisma: PrismaClient) {
  console.log('\n── Example 8: Streaming events ─────────────────────────────');

  const calcTool = new FunctionTool({
    name: 'add',
    description: 'Add two numbers.',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['a', 'b']
    } as any,
    execute: async (input: any) => {
      const { a, b } = input as { a: number; b: number };
      return { sum: a + b };
    }
  });

  const agent = new Agent({
    name: 'calc_agent',
    model: 'gemini-2.5-flash',
    instruction: 'Use the add tool to compute sums.',
    tools: [calcTool],
  });

  const sessionService = new PrismaSessionService(prisma);
  const sessionId = `stream_${Date.now()}`;
  await sessionService.createSession({ appName: APP, userId: 'demo', sessionId });
  const runner = new Runner({ appName: APP, agent, sessionService });

  for await (const event of runner.runAsync({
    userId: 'demo', sessionId,
    newMessage: { parts: [{ text: 'What is 17 + 25?' }] }
  })) {
    const parts = event.content?.parts ?? [];
    for (const part of parts as any[]) {
      if (part.text)           console.log(`  [text]     "${part.text.trim()}"`);
      if (part.functionCall)   console.log(`  [toolCall] ${part.functionCall.name}(${JSON.stringify(part.functionCall.args)})`);
      if (part.functionResponse) console.log(`  [toolResp] ${part.functionResponse.name} →`, part.functionResponse.response);
    }
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function run({ prisma }: { prisma: PrismaClient; dbName: string }) {
  await example1_basicAgent(prisma);
  await example2_toolAgent(prisma);
  await example3_sessionState(prisma);
  await example4_sequentialAgent(prisma);
  await example5_parallelAgent(prisma);
  await example6_agentAsTool(prisma);
  await example7_structuredOutput(prisma);
  await example8_streaming(prisma);

  console.log('\n✓ All ADK examples completed.');
}
