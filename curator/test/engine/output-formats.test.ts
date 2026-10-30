import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, snapshotDb } from '../helpers/harness.ts';
import { OutputFormats } from '../../src/engine/output/OutputFormats.js';
import { CuratorEngine } from '../../src/engine/CuratorEngine.js';

const page = {
  url: 'https://et.wikipedia.org/wiki/Orava',
  title: 'Orava – Vikipeedia',
  markdown: 'Asus [Võrumaal](https://et.wikipedia.org/wiki/V%C3%B5rumaa "Võrumaa"), vt [Lasva](https://x/Lasva_vald_\\(1939\\) "Lasva vald (1939)").[\\[1\\]](#cite_note-1) ![logo](https://x/a.png)',
  length: 120,
};
const llm = { target: 'llm' as const };

test('output: built-in pipeline steps (pick, field, strip-links, truncate, template, text)', () => {
  const out = new OutputFormats();
  assert.deepEqual(out.apply(page, 'pick:title,length', llm), { title: page.title, length: 120 });
  assert.equal(out.format(page, ['field:markdown', 'strip-links'], llm), 'Asus Võrumaal, vt Lasva.\\[1\\] ');
  assert.equal(out.format('abcdef', 'truncate:3', llm), 'abc\n… [truncated 3 chars]');
  assert.equal(out.format(page, 'template:{title} ({length} chars)', llm), 'Orava – Vikipeedia (120 chars)');
  assert.equal(out.format({ content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }] }, 'text', llm), 'a\nb');
  assert.equal(out.format(page, { use: 'pick', args: ['title'] }, llm), '{"title":"Orava – Vikipeedia"}');
  assert.throws(() => out.apply(page, 'nope', llm), /Unknown output formatter 'nope'/);
});

test('output: spec precedence is agent rules, then registered rules (latest first), then the tool own output', () => {
  const out = new OutputFormats();
  const tool = { output: { llm: 'field:url', display: 'field:title' } };
  const names = ['mcp.blueprint.web_scrape', 'blueprint_web_scrape'];
  assert.equal(out.formatToolResult(page, { target: 'llm', names, tool }), page.url);

  const off = out.registerToolOutput('mcp.*.web_scrape', { llm: 'field:title' });
  out.registerToolOutput('mcp.blueprint.*', { llm: 'field:length' });
  assert.equal(out.formatToolResult(page, { target: 'llm', names, tool }), '120');
  assert.equal(out.formatToolResult(page, { target: 'display', names, tool }), page.title, 'display falls through to the tool');

  const agentRules = { 'mcp.blueprint.web_scrape': { llm: 'field:markdown' as const } };
  assert.equal(out.formatToolResult(page, { target: 'llm', names, tool, agentRules }), page.markdown);

  off();
  assert.equal(out.formatToolResult({ x: 1 }, { target: 'llm', names: ['other'] }), undefined, 'no spec: caller default');
  assert.equal(out.formatToolResult(page, { target: 'llm', names, tool: { output: { llm: 'broken' } } }), '120');
  assert.equal(out.formatToolResult(page, { target: 'llm', names: ['x'], tool: { output: { llm: 'broken' } } }), undefined, 'a failing spec falls back');
});

test('output: plugins register formatters and tool output rules', () => {
  const engine = new CuratorEngine();
  engine.registerPlugin({
    name: 'fmt',
    formatters: { shout: (v) => String(v).toUpperCase() },
    toolOutput: { 'web_*': { llm: ['field:title', 'shout'] } },
  });
  assert.equal(engine.output.formatToolResult(page, { target: 'llm', names: ['web_scrape'] }), 'ORAVA – VIKIPEEDIA');
});

test('output: an agent formats tool results for the model, broadcasts the display form and formats its reply', async () => {
  const events: { type: string; payload: any }[] = [];
  const env = await createEnv('output_agent', { scrape: () => page }, { onEvent: (type: string, payload: any) => events.push({ type, payload }) });
  try {
    const model = env.useLlm([{ toolCalls: [{ name: 'scrape', args: {} }] }, 'See [the page](https://x).']);
    const { requestId } = await runAst(env, {
      type: 'Curator_Agent',
      agentName: 'reader',
      model: 'fake-model',
      prompt: 'summarize',
      tools: ['scrape'],
      tool_output: { scrape: { llm: ['pick:title,markdown', 'strip-links'], display: 'template:{title} ({length} chars)' } },
      output_format: 'strip-links',
    });
    const toolMsg = model.requests[1].messages.find((m) => m.role === 'tool');
    assert.deepEqual(JSON.parse(String(toolMsg?.content)), { title: page.title, markdown: 'Asus Võrumaal, vt Lasva.\\[1\\] ' });

    const shown = events.filter((e) => e.type === 'agent:tool_result').map((e) => e.payload);
    assert.deepEqual(shown, [{ requestId, conversationId: shown[0]?.conversationId, agentName: 'reader', tool: 'scrape', display: 'Orava – Vikipeedia (120 chars)' }]);

    const contents = (await snapshotDb(env)).responses.map((r: any) => r.content);
    assert.equal(contents.at(-1), 'See the page.');
    assert.equal(contents.find((c: string) => c.startsWith('[Tool Result: scrape]')), `[Tool Result: scrape]\n${toolMsg?.content}`, 'the stored result is what the model saw');
  } finally {
    await env.cleanup();
  }
});
