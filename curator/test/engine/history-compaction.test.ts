import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, saveScript } from '../helpers/harness.ts';
import { DEFAULT_SUMMARY_INSTRUCTION, HistoryCompactors, parseCompactionSpec } from '../../src/engine/history/HistoryCompaction.js';
import { CuratorEngine } from '../../src/engine/CuratorEngine.js';

const agent = (extra: any = {}) => ({ type: 'Curator_Agent', agentName: 'chat', model: 'fake-model', prompt: '{context.message}', ...extra });
const text = (messages: any[]) => messages.map((m) => `${m.role}:${m.content}`);

/** Fake model: summaries are `S1`, `S2`, ...; chat turns answer `a<n>` for message `m<n>`. */
function scriptedModel(env: any) {
  const summaries: any[] = [];
  const llm = env.useLlm((req: any) => {
    if (req.systemPrompt === DEFAULT_SUMMARY_INSTRUCTION) {
      summaries.push(req);
      return `S${summaries.length}`;
    }
    return String(req.messages.at(-1).content).replace('m', 'a');
  });
  const chatTurns = () => llm.requests.filter((r: any) => r.systemPrompt !== DEFAULT_SUMMARY_INSTRUCTION);
  return { summaries, chatTurns };
}

test('compaction spec: name, name:k=v and { use, args }', () => {
  assert.deepEqual(parseCompactionSpec('pack-first'), { name: 'pack-first', args: {} });
  assert.deepEqual(parseCompactionSpec('pack-middle:head=2,keep=3,max=8'), { name: 'pack-middle', args: { head: 2, keep: 3, max: 8 } });
  assert.deepEqual(parseCompactionSpec({ use: 'x', args: { a: 1 } }), { name: 'x', args: { a: 1 } });
});

test('pack-first: re-packs only past max, keeps the prefix stable in between, and folds the earlier summary in', async () => {
  const env = await createEnv('compact_first');
  try {
    const { summaries, chatTurns } = scriptedModel(env);
    for (let n = 1; n <= 6; n++) await runAst(env, agent({ history_compaction: 'pack-first:keep=1,max=2' }), { context: { message: `m${n}` } });
    const turns = chatTurns();

    assert.deepEqual(text(turns[2].messages), ['user:m1', 'assistant:a1', 'user:m2', 'assistant:a2', 'user:m3'], 'within max: verbatim');
    const s1 = '[Summary of the earlier conversation]\nS1';
    assert.deepEqual(text(turns[3].messages), [`user:${s1}`, 'user:m3', 'assistant:a3', 'user:m4']);
    assert.deepEqual(text(turns[4].messages), [`user:${s1}`, 'user:m3', 'assistant:a3', 'user:m4', 'assistant:a4', 'user:m5'], 'same prefix as the turn before');
    assert.deepEqual(text(turns[5].messages), ['user:[Summary of the earlier conversation]\nS2', 'user:m5', 'assistant:a5', 'user:m6']);

    assert.equal(summaries.length, 2, 'summarized once per re-pack, not per turn');
    assert.match(summaries[0].messages[0].content, /user: m1\nassistant: a1\nuser: m2\nassistant: a2$/);
    assert.match(summaries[1].messages[0].content, /^Earlier summary:\nS1\n\nuser: m3\nassistant: a3\nuser: m4\nassistant: a4$/);

    const records = (await env.prisma.response.findMany({ where: { content: { startsWith: '{"type":"HISTORY_SUMMARY"' } } }))
      .map((r: any) => JSON.parse(r.content).summary);
    assert.deepEqual(records.map((r: any) => [r.key, r.text]), [['chat|full|pack-first', 'S1'], ['chat|full|pack-first', 'S2']]);
  } finally {
    await env.cleanup();
  }
});

test('pack-middle: the opening turn stays verbatim ahead of the summary', async () => {
  const env = await createEnv('compact_middle');
  try {
    const { chatTurns } = scriptedModel(env);
    for (let n = 1; n <= 5; n++) await runAst(env, agent({ history_compaction: 'pack-middle:head=1,keep=1,max=2' }), { context: { message: `m${n}` } });
    assert.deepEqual(text(chatTurns()[4].messages), ['user:m1', 'assistant:a1', 'user:[Summary of the earlier conversation]\nS1', 'user:m4', 'assistant:a4', 'user:m5']);
  } finally {
    await env.cleanup();
  }
});

test('compaction: strategies are pluggable (plugin historyCompactors) and chosen per turn by expression', async () => {
  const engine = new CuratorEngine();
  const lastTurn = async ({ turns }: any) => ({ messages: turns.slice(-1).flatMap((t: any) => t.messages) });
  engine.registerPlugin({ name: 'compact', historyCompactors: { 'last-turn': lastTurn } });
  assert.equal(engine.historyCompactors.get('last-turn'), lastTurn);
  assert.ok(engine.historyCompactors.get('pack-first'), 'built-ins stay');

  const env = await createEnv('compact_plugin');
  try {
    const registry = new HistoryCompactors();
    registry.register('last-turn', lastTurn);
    (env.processor as any).engine.historyCompactors = registry;
    const { chatTurns } = scriptedModel(env);
    const node = agent({ history_compaction: '$context.compaction' });
    await runAst(env, node, { context: { message: 'm1' } });
    await runAst(env, node, { context: { message: 'm2' } });
    await runAst(env, node, { context: { message: 'm3', compaction: 'last-turn' } });
    await runAst(env, node, { context: { message: 'm4' } });
    assert.deepEqual(text(chatTurns()[2].messages), ['user:m2', 'assistant:a2', 'user:m3']);
    assert.equal(chatTurns()[3].messages.length, 7, 'no strategy: the full history');
  } finally {
    await env.cleanup();
  }
});

test('compaction agent=: a registered agent writes the summary as a child Request, then the turn resumes', async () => {
  const env = await createEnv('compact_agent');
  try {
    const { scriptId } = await saveScript(env, 'summarizer_script', {
      type: 'Curator_Agent', agentName: 'summarizer', model: 'small-model', instruction: 'SUMMARIZE', prompt: 'Notes for:\n{context.message}',
    });
    await env.prisma.agent.create({ data: { name: 'summarizer', scriptId, userId: env.userId, schedule: 'manual' } });
    const llm = env.useLlm((req: any) =>
      req.systemPrompt === 'SUMMARIZE' ? 'S-agent' : String(req.messages.at(-1).content).replace('m', 'a'));

    const node = agent({ history_compaction: 'pack-first:keep=1,max=1,agent=summarizer' });
    for (let n = 1; n <= 3; n++) await runAst(env, node, { context: { message: `m${n}` } });

    const summarizerCalls = llm.requests.filter((r: any) => r.systemPrompt === 'SUMMARIZE');
    assert.equal(summarizerCalls.length, 1);
    assert.equal(summarizerCalls[0].model, 'small-model', 'the summarizer agent runs with its own settings');
    assert.deepEqual(text(summarizerCalls[0].messages), ['user:Notes for:\nuser: m1\nassistant: a1'], 'transcript only, no chat history');

    const chat = llm.requests.filter((r: any) => r.systemPrompt !== 'SUMMARIZE');
    assert.deepEqual(text(chat.at(-1)!.messages), ['user:[Summary of the earlier conversation]\nS-agent', 'user:m2', 'assistant:a2', 'user:m3']);
    assert.equal(chat.length, 3, 'the parked turn calls its model once, after the summary');

    const requests = await env.prisma.request.findMany({ where: { agentId: { not: null } } });
    assert.deepEqual(requests.map((r: any) => r.status), ['COMPLETED']);
    // A later turn does not replay the summarizer's exchange.
    await runAst(env, node, { context: { message: 'm4' } });
    const last = llm.requests.at(-1)!;
    assert.ok(!last.messages.some((m: any) => /^Notes for|^user: m1/.test(String(m.content))), 'the summarizer exchange is not history');
  } finally {
    await env.cleanup();
  }
});
