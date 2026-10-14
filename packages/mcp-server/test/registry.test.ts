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

test('McpToolRegistry integrates ExposurePolicyController for dynamic gating and leases', async () => {
  const { ExposurePolicyController } = await import('../../../curator/dist/src/index.js');
  const engine = new CuratorEngine();
  const exposure = new ExposurePolicyController();

  const normalTool = defineTool({
    name: 'search_notes',
    description: 'Read-only search tool',
    accessLevel: 'read_only',
    parameters: { type: 'object', properties: {} },
    mcp: { expose: true },
    execute: async () => ({ results: ['note1'] }),
  });

  const heavyTool = defineTool({
    name: 'llama_generate',
    description: 'Heavy LLM tool',
    accessLevel: 'read_only',
    parameters: { type: 'object', properties: {} },
    mcp: { expose: true },
    execute: async () => ({ text: 'generated' }),
  });

  const adminTool = defineTool({
    name: 'delete_system_logs',
    description: 'Destructive admin tool',
    accessLevel: 'admin',
    requiredRole: 'system_admin',
    parameters: { type: 'object', properties: {} },
    mcp: { expose: true },
    execute: async () => ({ deleted: true }),
  });

  engine.registerTool(normalTool);
  engine.registerTool(heavyTool);
  engine.registerTool(adminTool);

  const registry = McpToolRegistry.fromEngine(engine, async () => ({}), exposure);

  // 1. Guest session: only sees read_only tool, not adminTool
  const guestList = registry.list({ peerId: 'peer_guest', trustTier: 'guest' });
  const guestToolNames = guestList.map((t) => t.name);
  assert.ok(guestToolNames.includes('search_notes'));
  assert.ok(!guestToolNames.includes('delete_system_logs'));

  // 2. High CPU load tripwire: shed heavy llama tools
  exposure.setInternalState({ cpuLoad: 0.90 }); // 90% CPU
  const throttledList = registry.list({ peerId: 'peer_collab', trustTier: 'collaborator' });
  const throttledNames = throttledList.map((t) => t.name);
  assert.ok(!throttledNames.includes('llama_generate'), 'Heavy LLM tool should be throttled under 90% CPU');

  // Cluster admin still gets access during throttling
  const adminList = registry.list({ peerId: 'peer_admin', trustTier: 'cluster_admin' });
  assert.ok(adminList.map((t) => t.name).includes('llama_generate'));

  // 3. Ephemeral lease: grant temporary access to a contractor
  const contractorSession = { peerId: 'contractor_1', trustTier: 'contractor' as const };
  exposure.setToolRule('delete_system_logs', { minTrustTier: 'cluster_admin' });

  let contractorList = registry.list(contractorSession);
  assert.ok(!contractorList.map((t) => t.name).includes('delete_system_logs'));

  // Grant 1-invocation ephemeral lease
  const lease = exposure.grantLease({
    toolName: 'delete_system_logs',
    granteePeerId: 'contractor_1',
    maxInvocations: 1,
    durationMs: 60000,
  });

  contractorList = registry.list(contractorSession);
  assert.ok(contractorList.map((t) => t.name).includes('delete_system_logs'), 'Leased tool should now appear');

  // Invoke tool with lease
  const callRes = await registry.call('delete_system_logs', {}, contractorSession);
  assert.equal(callRes.isError, undefined);

  // After 1 invocation, lease expires
  assert.equal(exposure.getActiveLeases('contractor_1').length, 0);
  const postLeaseList = registry.list(contractorSession);
  assert.ok(!postLeaseList.map((t) => t.name).includes('delete_system_logs'), 'Leased tool should disappear after maxInvocations');
});
