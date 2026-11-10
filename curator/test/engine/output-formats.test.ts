import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, snapshotDb } from '../helpers/harness.ts';
import { OutputFormats } from '../../src/engine/output/OutputFormats.js';
import { CuratorEngine } from '../../src/engine/CuratorEngine.js';
import { defineTool } from '../../src/tools/CuratorTool.ts';

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

test('output: surface formatter builds table, resource and data surfaces', () => {
  const out = new OutputFormats();
  const ctx = { target: 'surface' as const };
  assert.deepEqual(out.apply([{ a: 1 }], 'surface:table', ctx), { component: 'table', data: { rows: [{ a: 1 }] } });
  assert.deepEqual(out.apply({ items: [{ id: 1 }], total: 9 }, 'surface:resources', ctx), { component: 'resource-collection', items: [{ id: 1 }], total: 9 });
  assert.deepEqual(out.apply({ text: '# Hi' }, ['field:text', { use: 'surface', args: { component: 'markdown', title: 'Note' } }], ctx), { component: 'markdown', title: 'Note', data: '# Hi' });
  // No rule, or a pipeline that does not yield a surface: nothing
  assert.equal(out.surfaceForToolResult({ a: 1 }, { names: ['t'] }), undefined);
  out.registerToolOutput('t', { surface: 'field:a' });
  assert.equal(out.surfaceForToolResult({ a: 1 }, { names: ['t'] }), undefined);
});

test('output: a direct tool run gets uiSurface from surface rules, unless it returns its own', async () => {
  const env = await createEnv('output_surface');
  try {
    const output = new OutputFormats();
    output.registerToolOutput('list_rows', { surface: ['field:rows', { use: 'surface', args: { component: 'table', title: 'Rows' } }] });
    const engine = (env.processor as any).engine;
    engine.output = output;
    const run = async (toolName: string, result: any) => {
      engine.tools.set(toolName, defineTool({ name: toolName, description: toolName, parameters: { type: 'object', properties: {} }, execute: async () => result } as any));
      await env.prisma.tool.create({ data: { name: toolName } }).catch(() => null);
      return (await env.processor.runToolRequest({ toolName, args: {}, conversationId: env.conversationId, userId: env.userId, origin: 'API' } as any)).result as any;
    };
    const plain = await run('list_rows', { rows: [{ n: 1 }, { n: 2 }] });
    assert.deepEqual(plain.uiSurface, { component: 'table', title: 'Rows', data: { rows: [{ n: 1 }, { n: 2 }] } });
    assert.deepEqual(plain.rows, [{ n: 1 }, { n: 2 }]);

    output.registerToolOutput('own_surface', { surface: 'surface:json' });
    const own = await run('own_surface', { uiSurface: { component: 'markdown', data: 'mine' } });
    assert.deepEqual(own.uiSurface, { component: 'markdown', data: 'mine' });
  } finally { await env.cleanup(); }
});
