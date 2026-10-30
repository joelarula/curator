import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';

// Two chat turns in one conversation: the first reads a page with a tool, the second is a follow-up.
const agent = (extra: any = {}) => ({ type: 'Curator_Agent', agentName: 'reader', model: 'fake-model', prompt: '{context.message}', tools: ['scrape'], ...extra });
const firstTurn = [{ toolCalls: [{ name: 'scrape', args: { url: 'https://x' } }] }, 'Orava is a parish.'];
const shape = (messages: any[]) =>
  messages.map((m) => (m.toolCalls ? `${m.role}:calls(${m.toolCalls.map((c: any) => c.name)})` : `${m.role}:${m.content}`));

async function twoTurns(name: string, second: any, secondContext: Record<string, any> = {}) {
  const env = await createEnv(name, { scrape: () => ({ title: 'Orava' }) });
  const llm = env.useLlm([...firstTurn, 'follow-up answer']);
  await runAst(env, agent(), { context: { message: 'summarize https://x' } });
  await runAst(env, agent(second), { context: { message: 'and who was born there?', ...secondContext } });
  return { env, last: llm.requests[llm.requests.length - 1] };
}

test('history full: an earlier turn replays once, with its tool call and result as tool messages', async () => {
  const { env, last } = await twoTurns('hist_full', {});
  try {
    assert.deepEqual(shape(last.messages), [
      'user:summarize https://x',
      'assistant:calls(scrape)',
      'tool:{"title":"Orava"}',
      'assistant:Orava is a parish.',
      'user:and who was born there?',
    ]);
    const [call, result] = [last.messages[1] as any, last.messages[2] as any];
    assert.deepEqual(call.toolCalls[0].args, { url: 'https://x' });
    assert.equal(result.toolCallId, call.toolCalls[0].id, 'the result answers its call');
  } finally {
    await env.cleanup();
  }
});

test('history answers: an earlier turn replays as its prompt and final answer only', async () => {
  const { env, last } = await twoTurns('hist_answers', { history_profile: 'answers' });
  try {
    assert.deepEqual(shape(last.messages), ['user:summarize https://x', 'assistant:Orava is a parish.', 'user:and who was born there?']);
  } finally {
    await env.cleanup();
  }
});

test('history full: calls to tools not offered now replay as text, never as orphan tool messages', async () => {
  const { env, last } = await twoTurns('hist_unoffered', { tools: [] });
  try {
    assert.deepEqual(shape(last.messages), [
      'user:summarize https://x',
      'assistant:[Tool Result: scrape]\n{"title":"Orava"}',
      'assistant:Orava is a parish.',
      'user:and who was born there?',
    ]);
  } finally {
    await env.cleanup();
  }
});

test('history profile: chosen per turn by expression (e.g. from the intent in the context)', async () => {
  const { env, last } = await twoTurns('hist_expr', { history_profile: '$context.history' }, { history: 'answers' });
  try {
    assert.equal(last.messages.length, 3);
  } finally {
    await env.cleanup();
  }
  const unset = await twoTurns('hist_expr_unset', { history_profile: '$context.history' });
  try {
    assert.equal(unset.last.messages.length, 5, 'unset falls back to full');
  } finally {
    await unset.env.cleanup();
  }
});
