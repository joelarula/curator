import test from 'node:test';
import assert from 'node:assert/strict';
import { CuratorEngine } from '../../src/engine/CuratorEngine.js';
import { llmToolName } from '../../src/engine/nodes/agent.js';
import { defineTool } from '../../src/tools/CuratorTool.js';

const tool = (name: string, extra: Record<string, unknown> = {}) =>
  Object.assign(defineTool({ name, description: name, parameters: { type: 'object' }, execute: async () => name }), extra);

test('llmToolName keeps valid names and maps aliases to provider-safe, unique names', () => {
  const taken = new Set<string>();
  assert.equal(llmToolName('search_docs', taken), 'search_docs');
  assert.equal(llmToolName('mcp.google.search_gmail', taken), 'mcp__google__search_gmail');
  assert.equal(llmToolName('mcp.crm.lookup@p1', taken), 'mcp__crm__lookup_p1');
  assert.equal(llmToolName('9lives', taken), '_9lives');

  taken.add('mcp__crm__lookup');
  assert.equal(llmToolName('mcp.crm.lookup', taken), 'mcp__crm__lookup_2');

  const long = llmToolName(`mcp.server.${'x'.repeat(80)}`, new Set());
  assert.ok(long.length <= 64 && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(long));
  assert.notEqual(long, llmToolName(`mcp.server.${'x'.repeat(81)}`, new Set()));
});

test('resolveTool: exact keys win, then resolvers within the scope', () => {
  const engine = new CuratorEngine();
  const local = tool('lookup');
  const remoteA = tool('mcp.crm.lookup@a', { origin: 'remote' });
  engine.registerTool(local);
  engine.registerTool(remoteA);
  const off = engine.addToolResolver((name, scope) => (name === 'mcp.crm.lookup' && scope.projectId === 'a' ? remoteA : undefined));

  assert.equal(engine.resolveTool('lookup'), local);
  assert.equal(engine.resolveTool('mcp.crm.lookup', { projectId: 'a' }), remoteA);
  assert.equal(engine.resolveTool('mcp.crm.lookup', { projectId: 'b' }), undefined);
  off();
  assert.equal(engine.resolveTool('mcp.crm.lookup', { projectId: 'a' }), undefined);
});

test('listTools matches patterns over local keys and per-project aliases, never raw remote keys', () => {
  const engine = new CuratorEngine();
  const remoteA = tool('mcp.crm.lookup@a', { origin: 'remote' });
  const remoteB = tool('mcp.crm.lookup@b', { origin: 'remote' });
  engine.registerTool(tool('mcp_servers_list'));
  engine.registerTool(tool('notes_search'));
  engine.registerTool(remoteA);
  engine.registerTool(remoteB);
  engine.addToolResolver(
    () => undefined,
    (scope) => [{ name: 'mcp.crm.lookup', tool: scope.projectId === 'a' ? remoteA : remoteB }]
  );

  const names = (pattern: string, projectId: string) => engine.listTools(pattern, { projectId }).map((e) => `${e.name}=${e.tool.name}`).sort();
  assert.deepEqual(names('mcp.*', 'a'), ['mcp.crm.lookup=mcp.crm.lookup@a']);
  assert.deepEqual(names('mcp.*', 'b'), ['mcp.crm.lookup=mcp.crm.lookup@b']);
  assert.deepEqual(names('mcp*', 'a'), ['mcp.crm.lookup=mcp.crm.lookup@a', 'mcp_servers_list=mcp_servers_list']);
  assert.deepEqual(names('*_search', 'a'), ['notes_search=notes_search']);
  // `.` is literal in patterns.
  assert.deepEqual(names('mcp.crm.look*', 'a'), ['mcp.crm.lookup=mcp.crm.lookup@a']);
  assert.deepEqual(names('mcpXcrm*', 'a'), []);
});
