import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, compileFixture } from '../helpers/harness.ts';
import { loadConversationEntries, ConversationContextBuilder } from '../../src/engine/llm/ConversationContext.ts';
// @ts-ignore compiled JS package, no declarations needed for this demo
import { GeminiLlmProvider } from '../../../packages/plugin-llm-gemini/dist/GeminiLlmProvider.js';

const T0 = Date.UTC(2100, 0, 1);
const SYSTEM = 'You are {me}, one of three participants (a, b, c) in a free group chat. Others are shown as "[name]: text". Reply only with your own next line.';

async function drain(env: any) {
  for (let idle = 0; idle < 3; ) {
    const n = await env.processor.step({ conversationId: env.conversationId, take: 10 });
    idle = n > 0 ? 0 : idle + 1;
  }
}

// Runs the real spontaneous flow, then shows what each agent would send to Gemini (DEMO=1 prints it).
test('spontaneous trilogue materialised as Gemini requests, one view per agent', async () => {
  let now = T0;
  const env = await createEnv('spont_text', {}, { now: () => now });
  try {
    await runAst(env, await compileFixture('spontaneous_text.coffee'));
    now += 11_000;
    await drain(env);

    const entries = await loadConversationEntries(env.prisma, env.conversationId, { eventNames: ['say'] });
    const gemini: any = new GeminiLlmProvider('test-key');
    const requestFor = (me: string) => {
      const view = new ConversationContextBuilder({ system: SYSTEM.replace('{me}', me) }).pushAll(entries).build(me);
      return {
        systemInstruction: { parts: [{ text: view.systemPrompt }] },
        contents: gemini.formatGeminiContents(view.messages),
      };
    };
    const out = { a: requestFor('a'), b: requestFor('b'), c: requestFor('c') };
    if (process.env.DEMO) {
      console.log('ROOM ORDER:', entries.map((e) => `${e.speaker}: ${e.text}`));
      console.log(JSON.stringify(out, null, 2));
    }

    assert.deepEqual(entries.map((e) => e.speaker).slice(0, 1).concat(entries.slice(1, 3).map((e) => e.speaker).sort(), entries.slice(3).map((e) => e.speaker)), ['a', 'b', 'c', 'a']);
    assert.equal(entries.length, 4);
    assert.equal(entries[0].speaker, 'a');
    assert.equal(out.a.contents[0].parts[0].text, '[Conversation Started]', 'a opened, so Gemini needs a leading user turn');
    assert.equal(out.a.contents[1].role, 'model');
    assert.equal(out.b.contents[0].role, 'user');
  } finally {
    await env.cleanup();
  }
});
