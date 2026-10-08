import test from 'node:test';
import assert from 'node:assert/strict';
import { CuratorEngine, defineTool } from '../../../curator/dist/src/index.js';
import { McpToolRegistry } from '../dist/McpToolRegistry.js';

test('McpToolRegistry correctly filters exposed tools and executes them', async () => {
  const engine = new CuratorEngine();

  const exposedTool = defineTool({
    name: 'test_exposed',
    description: 'An exposed MCP tool',
    mcp: { expose: true },
    parameters: {
      type: 'object',
      properties: {
        msg: { type: 'string' },
      },
    },
    execute: async (args) => {
      return { echoed: args.msg };
    },
  });

  const hiddenTool = defineTool({
    name: 'test_hidden',
    description: 'An internal hidden tool',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      return { secret: 123 };
    },
  });

  engine.registerTool(exposedTool);
  engine.registerTool(hiddenTool);

  const registry = McpToolRegistry.fromEngine(engine, async () => ({}));

  const tools = registry.list();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'test_exposed');
  assert.equal(tools[0].description, 'An exposed MCP tool');

  // Call exposed tool
  const result = await registry.call('test_exposed', { msg: 'hello' });
  assert.equal(result.isError, undefined);
  assert.ok(result.content[0].text.includes('"echoed": "hello"'));

  // Call hidden tool
  const hiddenResult = await registry.call('test_hidden', {});
  assert.equal(hiddenResult.isError, true);
  assert.ok(hiddenResult.content[0].text.includes('Unknown or unexposed MCP tool'));
});

test('McpToolRegistry respects plugin policies (exposeAll, exclude, include)', async () => {
  const engine = new CuratorEngine();

  const toolA = defineTool({
    name: 'tool_a',
    description: 'Tool A',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ a: 1 }),
  });

  const toolB = defineTool({
    name: 'tool_b',
    description: 'Tool B',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ b: 2 }),
  });

  engine.registerPlugin({
    name: 'sample-plugin',
    mcp: {
      exposeAll: true,
      exclude: ['tool_b'],
    },
    tools: {
      tool_a: toolA,
      tool_b: toolB,
    },
  });

  const registry = McpToolRegistry.fromEngine(engine, async () => ({}));
  const list = registry.list();

  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'tool_a');
});
