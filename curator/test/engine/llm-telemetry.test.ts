import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { BatchTraceWriter } from '../../src/engine/StepTrace.ts';
import type { LlmTelemetryRecord } from '../../src/engine/llm/LlmTrace.ts';

const agent = (extra: any = {}) => ({
  type: 'Curator_Agent',
  agentName: 'researcher',
  model: 'gemini-2.5-flash',
  prompt: 'summarize the article',
  ...extra,
});

test('llm telemetry: records numeric usage, context sizes and token metrics', async () => {
  const env = await createEnv('telemetry_metrics');
  try {
    const fakeReply = {
      text: 'Here is the summary of the article.',
      usage: {
        inputTokens: 128,
        outputTokens: 32,
        cachedTokens: 64,
        totalTokens: 160,
      },
    };
    env.useLlm([fakeReply as any]);

    const { requestId, result } = await runAst(env, agent({ instruction: 'You are a helpful analyst.' }));
    assert.equal(result.done, true);

    // Flush batch trace buffer
    await env.processor.idle();

    // Query LlmTelemetry rows from database
    const rows = await env.prisma.llmTelemetry.findMany({
      where: { conversationId: env.conversationId },
      orderBy: { turn: 'asc' },
    });

    assert.equal(rows.length, 1, 'one telemetry record for direct turn');
    const rec = rows[0];

    // Scoping & Traceability
    assert.equal(rec.conversationId, env.conversationId);
    assert.equal(rec.requestId, requestId);
    assert.equal(rec.turn, 1);
    assert.equal(rec.projectId, 'system');

    // Dimensions
    assert.equal(rec.model, 'gemini-2.5-flash');
    assert.equal(rec.status, 'success');
    assert.equal(rec.finishReason, 'stop');

    // Context & Payload sizes
    assert.ok(rec.requestChars > 0, 'requestChars calculated from prompt + instruction');
    assert.equal(rec.responseChars, fakeReply.text.length, 'responseChars matches response text length');
    assert.equal(rec.estimatedTokens, Math.ceil(rec.requestChars / 4));

    // Token counts reported by provider (Gemini usageMetadata)
    assert.equal(rec.promptTokens, 128);
    assert.equal(rec.completionTokens, 32);
    assert.equal(rec.cachedTokens, 64);
    assert.equal(rec.totalTokens, 160);
    assert.ok(typeof rec.latencyMs === 'number' && rec.latencyMs >= 0);
  } finally {
    await env.cleanup();
  }
});

test('llm telemetry: multi-turn agentic loop records turn progression', async () => {
  const env = await createEnv('telemetry_turns', {
    search: (a: any) => ({ results: [`found info for ${a.query}`] }),
  });
  try {
    env.useLlm([
      {
        toolCalls: [{ name: 'search', args: { query: 'climate' } }],
        usage: { inputTokens: 50, outputTokens: 20, cachedTokens: 0, totalTokens: 70 },
      } as any,
      {
        text: 'Found climate info.',
        usage: { inputTokens: 120, outputTokens: 15, cachedTokens: 40, totalTokens: 135 },
      } as any,
    ]);

    const { requestId, result } = await runAst(env, agent({ tools: ['search'] }));
    assert.equal(result.done, true);

    await env.processor.idle();

    const rows = await env.prisma.llmTelemetry.findMany({
      where: { conversationId: env.conversationId, requestId },
      orderBy: { turn: 'asc' },
    });

    assert.equal(rows.length, 2, 'records one telemetry row per agent iteration');
    assert.equal(rows[0].turn, 1);
    assert.equal(rows[0].finishReason, 'tool_use');
    assert.equal(rows[0].promptTokens, 50);

    assert.equal(rows[1].turn, 2);
    assert.equal(rows[1].finishReason, 'stop');
    assert.equal(rows[1].promptTokens, 120);
    assert.equal(rows[1].cachedTokens, 40);
  } finally {
    await env.cleanup();
  }
});

test('llm telemetry: retention and prune removes old records', async () => {
  const env = await createEnv('telemetry_prune');
  try {
    env.useLlm(['test reply']);
    await runAst(env, agent());
    await env.processor.idle();

    const countBefore = await env.prisma.llmTelemetry.count({ where: { conversationId: env.conversationId } });
    assert.equal(countBefore, 1);

    const writer = new BatchTraceWriter<LlmTelemetryRecord>(env.prisma, 'LlmTelemetry');
    // Prune rows older than epoch -> nothing pruned
    assert.equal(await writer.prune(new Date(0)), 0);

    // Prune rows older than future -> row pruned
    const pruned = await writer.prune(new Date(Date.UTC(2200, 0, 1)));
    assert.equal(pruned, 1);

    const countAfter = await env.prisma.llmTelemetry.count({ where: { conversationId: env.conversationId } });
    assert.equal(countAfter, 0);
  } finally {
    await env.cleanup();
  }
});

