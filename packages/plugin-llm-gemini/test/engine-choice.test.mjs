import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

// Real curator engine + real Gemini: the CoffeeScript fixture offers a dynamic set of tools and the model must call them.
test('gemini: the model acts through tools offered by a CoffeeScript flow, and the offered set changes per turn', { skip }, async () => {
  const tsx = createRequire(resolve(curator, 'package.json')).resolve('tsx/esm/api');
  (await import(pathToFileURL(tsx).href)).register();

  const { createEnv, runAst } = await import(url('test/helpers/harness.ts'));
  const { LlmFactory } = await import(url('src/engine/llm/LlmFactory.ts'));
  const { compileCoffeeScriptToAST } = await import(url('src/engine/CoffeeVerbs.ts'));
  const { defineTool } = await import(url('src/tools/CuratorTool.ts'));
  const { GeminiLlmProvider } = await import(pathToFileURL(resolve(here, '../dist/GeminiLlmProvider.js')).href);

  const real = new GeminiLlmProvider(API_KEY);
  const exchanges = [];
  LlmFactory.registerProvider('gemini', {
    providerName: 'gemini-recorded',
    async generateContent(req) {
      const response = await real.generateContent(req);
      exchanges.push({
        offered: (req.tools ?? []).map((t) => t.name),
        request: {
          model: req.model,
          systemPrompt: req.systemPrompt,
          tools: JSON.parse(JSON.stringify(req.tools ?? [])),
          messages: JSON.parse(JSON.stringify(req.messages)),
          geminiContents: JSON.parse(JSON.stringify(real.formatGeminiContents(req.messages))),
        },
        response: JSON.parse(JSON.stringify({ text: response.text ?? '', toolCalls: response.toolCalls ?? [], finishReason: response.finishReason })),
        messages: JSON.parse(JSON.stringify(req.messages)),
        toolCalls: (response.toolCalls ?? []).map((c) => ({ name: c.name, args: c.args })),
        text: (response.text ?? '').trim(),
      });
      return response;
    },
  });

  const env = await createEnv('gemini_choice');
  try {
    const taken = [];
    const tools = env.processor.engine.tools;
    const add = (name, parameters) =>
      tools.set(name, defineTool({
        name,
        description: `Poker action: ${name}`,
        parameters,
        execute: async (args) => {
          taken.push({ tool: name, args });
          return JSON.stringify({ ok: true, action: name, ...args });
        },
      }));
    const amount = { type: 'object', properties: { amount: { type: 'integer', description: 'chips' } }, required: ['amount'] };
    const none = { type: 'object', properties: {} };
    add('fold', none); add('call', none); add('raise', amount); add('check', none); add('bet', amount);

    const ast = await compileCoffeeScriptToAST(readFileSync(resolve(here, 'fixtures/choice_gemini.coffee'), 'utf8'), {});
    await runAst(env, ast);

    for (const [i, ex] of exchanges.entries()) {
      console.log(`--- #${i + 1} offered [${ex.offered}] calls ${JSON.stringify(ex.toolCalls)} text: ${ex.text}`);
    }

    // Full request/response pairs for inspection: JSON for tooling, Markdown for reading.
    const outDir = resolve(here, 'output');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'engine-choice.json'), JSON.stringify({ taken, exchanges: exchanges.map(({ request, response }) => ({ request, response })) }, null, 2));
    const fence = (v) => '```json\n' + JSON.stringify(v, null, 2) + '\n```';
    const report = [
        '# Gemini tool choice through the Curator engine',
        '',
        `Flow: \`test/fixtures/choice_gemini.coffee\` (CoffeeScript -> AST). Tools actually executed: ${fence(taken)}`,
        ...exchanges.flatMap((ex, i) => [
          '',
          `## Exchange ${i + 1} (offered: ${ex.offered.join(', ') || 'none'})`,
          '',
          `**System prompt:** ${ex.request.systemPrompt}`,
          '',
          '**Tools offered to the model:**',
          fence(ex.request.tools),
          '',
          '**Messages from the engine:**',
          fence(ex.request.messages),
          '',
          '**Gemini `contents` (wire format):**',
          fence(ex.request.geminiContents),
          '',
          '**Response:**',
          fence(ex.response),
        ]),
        '',
      ].join('\n');
    writeFileSync(resolve(outDir, 'engine-choice.md'), report);
    console.log(report);
    console.log(`written: ${resolve(outDir, 'engine-choice.md')}`);

    const round1 = ['fold', 'call', 'raise'];
    const round2 = ['fold', 'call'];
    assert.deepEqual(exchanges[0].offered, round1, 'round 1 offers exactly the state options');
    assert.ok(exchanges.some((e) => e.offered.join() === round2.join()), 'round 2 was offered the narrowed options');

    // The flow never names an action; the model chooses, and only from what is on offer.
    assert.equal(taken.length, 2, 'the model acted once per round');
    assert.ok(round1.includes(taken[0].tool));
    assert.ok(round2.includes(taken[1].tool));
    if (taken[0].tool === 'raise') assert.ok(Number.isInteger(Number(taken[0].args.amount)) && Number(taken[0].args.amount) > 0);

    // Decisions follow the context: never fold the nuts to a tiny bet, never call an all-in with nothing.
    assert.notEqual(taken[0].tool, 'fold', 'a set of aces does not fold to a 10 bet');
    assert.equal(taken[1].tool, 'fold', 'seven-deuce does not call an all-in for the whole stack');
  } finally {
    await env.cleanup();
  }
});
