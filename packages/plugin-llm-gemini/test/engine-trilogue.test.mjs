import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(resolve(here, '../../../.env'));
} catch {}

const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const skip = !API_KEY && 'GOOGLE_API_KEY not set';
const curator = resolve(here, '../../../curator');
const url = (p) => pathToFileURL(resolve(curator, p)).href;

// Real curator engine (TypeScript sources) + real Gemini; the CoffeeScript fixture is compiled to the AST.
test('gemini: spontaneous trilogue run by the curator engine from a CoffeeScript AST, two turns each', { skip }, async () => {
  const tsx = createRequire(resolve(curator, 'package.json')).resolve('tsx/esm/api');
  (await import(pathToFileURL(tsx).href)).register();

  const { createEnv, runAst } = await import(url('test/helpers/harness.ts'));
  const { LlmFactory } = await import(url('src/engine/llm/LlmFactory.ts'));
  const { compileCoffeeScriptToAST } = await import(url('src/engine/CoffeeVerbs.ts'));
  const { GeminiLlmProvider } = await import(pathToFileURL(resolve(here, '../dist/GeminiLlmProvider.js')).href);

  // Records every real request/response pair; it forwards to Gemini unchanged.
  const real = new GeminiLlmProvider(API_KEY);
  const exchanges = [];
  LlmFactory.registerProvider('gemini', {
    providerName: 'gemini-recorded',
    async generateContent(req) {
      const response = await real.generateContent(req);
      exchanges.push({
        agent: /You are (\w)/.exec(req.systemPrompt ?? '')?.[1],
        systemPrompt: req.systemPrompt,
        messages: JSON.parse(JSON.stringify(req.messages)),
        reply: (response.text ?? '').trim(),
      });
      return response;
    },
  });

  let now = Date.UTC(2100, 0, 1);
  const env = await createEnv('gemini_trilogue', {}, { now: () => now });
  try {
    const ast = await compileCoffeeScriptToAST(readFileSync(resolve(here, 'fixtures/trilogue_gemini.coffee'), 'utf8'), {});
    await runAst(env, ast);
    const drain = async () => {
      for (let idle = 0; idle < 3; ) {
        const n = await env.processor.step({ conversationId: env.conversationId, take: 10 });
        idle = n > 0 ? 0 : idle + 1;
      }
    };
    await drain();
    assert.equal(exchanges.length, 0, 'a silent room stays silent until someone is impatient');
    now += 11_000;
    await drain();

    for (const [i, ex] of exchanges.entries()) {
      console.log(`--- #${i + 1} ${ex.agent} sent ${ex.messages.length} messages\n${ex.messages.map((m) => `   ${m.role}: ${m.content}`).join('\n')}\n${ex.agent}: ${ex.reply}`);
    }

    assert.equal(exchanges.length, 6, 'three agents, two turns each');
    const PROMPT = 'It is your turn.';
    for (const who of ['a', 'b', 'c']) {
      const turns = exchanges.filter((e) => e.agent === who);
      assert.equal(turns.length, 2, `${who} spoke twice`);
      const [first, second] = turns;
      assert.ok(turns.every((t) => t.reply), `${who} produced real replies`);

      for (const t of turns) {
        const last = t.messages.at(-1);
        assert.equal(last.role, 'user');
        assert.ok(last.content.startsWith(PROMPT), 'the turn prompt is the final message');
        assert.equal(t.messages.filter((m) => m.content.startsWith(PROMPT)).length, 1, 'turn prompts of earlier turns are not history');
        assert.ok(!t.messages.some((m) => m.role === 'user' && m.content.startsWith(`[${who}]`)), 'own lines are never labelled as another speaker');
      }
      assert.ok(!first.messages.some((m) => m.role === 'assistant'), `${who}'s first turn has no own history`);
      assert.deepEqual(
        second.messages.filter((m) => m.role === 'assistant').map((m) => m.content),
        [first.reply],
        `${who}'s second request carries its own first line as the assistant turn`,
      );
      for (const other of ['a', 'b', 'c'].filter((x) => x !== who)) {
        assert.ok(second.messages.some((m) => m.content.startsWith(`[${other}]:`)), `${who} heard ${other} before its second turn`);
      }
    }
    assert.equal(exchanges[0].agent, 'a', 'a opened on its own');
    assert.equal(exchanges[0].messages.length, 1, 'the opener saw an empty room');
  } finally {
    await env.cleanup();
  }
});
