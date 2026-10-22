import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, snapshotDb, assertGolden, startFakeMcpServer } from '../helpers/harness.ts';
import { createMcpPlugin } from '../../src/plugins/mcp/index.js';

const echoServer = () =>
  startFakeMcpServer({
    echo: {
      description: 'Echoes the message',
      inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
      handler: (a) => `Echo: ${a.message}`,
    },
    boom: { handler: () => ({ error: 'kaput' }) },
  });

/** Connects the plugin and registers its tools on the test engine, like curatorEngine.registerPlugin does. */
async function mount(env: any, server: Awaited<ReturnType<typeof echoServer>>) {
  const plugin = await createMcpPlugin('mcp-test', server.transport);
  for (const [name, tool] of Object.entries(plugin.tools ?? {})) env.processor.engine.tools.set(name, tool);
  return plugin;
}

test('mcp plugin: maps listed MCP tools to Curator tools with their schema', async () => {
  const server = await echoServer();
  const env = await createEnv('mcp_map');
  try {
    const plugin = await mount(env, server);
    assert.deepEqual(Object.keys(plugin.tools ?? {}).sort(), ['boom', 'echo']);
    const echo = env.processor.engine.tools.get('echo');
    assert.equal(echo.description, 'Echoes the message');
    assert.deepEqual(echo.parameters.required, ['message']);
  } finally {
    await env.cleanup();
    await server.close();
  }
});

test('ast/mcp: an agent calls an MCP tool and the server sees the exact arguments', async () => {
  const server = await echoServer();
  const env = await createEnv('mcp_agent');
  try {
    await mount(env, server);
    const llm = env.useLlm([
      { toolCalls: [{ name: 'echo', args: { message: 'Hello MCP World!' } }] },
      'I got: Echo: Hello MCP World!',
    ]);
    const { run } = await import('../fixtures/ast/mcp.ts');
    const { requestId, result } = await runAst(env, run());
    assert.equal(result.done, true);
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'COMPLETED');

    assert.deepEqual(server.received, [{ name: 'echo', args: { message: 'Hello MCP World!' } }]);
    assert.deepEqual(llm.requests[0].tools?.map((t) => t.name), ['echo']);
    const toolMsg = llm.requests[1].messages.find((m) => m.role === 'tool');
    assert.equal(toolMsg?.content, 'Echo: Hello MCP World!');
    assert.notEqual(toolMsg?.isError, true);
    assertGolden('ast/mcp.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
    await server.close();
  }
});

test('mcp: server-reported tool errors reach the model as errors, not crashes', async () => {
  const server = await echoServer();
  const env = await createEnv('mcp_error');
  try {
    await mount(env, server);
    const llm = env.useLlm([{ toolCalls: [{ name: 'boom' }] }, 'it failed']);
    const { requestId } = await runAst(env, { type: 'Curator_Agent', agentName: 'a', model: 'm', prompt: 'go', tools: ['boom'] });
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'COMPLETED');
    const toolMsg = llm.requests[1].messages.find((m) => m.role === 'tool');
    assert.equal(toolMsg?.isError, true);
    assert.match(String(toolMsg?.content), /kaput/);
  } finally {
    await env.cleanup();
    await server.close();
  }
});

test('mcp: a workflow Tool node can call an MCP tool directly (no LLM)', async () => {
  const server = await echoServer();
  const env = await createEnv('mcp_tool_node');
  try {
    await mount(env, server);
    const { requestId } = await runAst(env, { type: 'Curator_Tool', toolName: 'echo', args: { message: 'direct' }, as: 'out' });
    assert.equal((await env.prisma.request.findUnique({ where: { id: requestId } })).status, 'COMPLETED');
    assert.deepEqual(server.received, [{ name: 'echo', args: { message: 'direct' } }]);
    const responses = await env.prisma.response.findMany({ where: { requestId } });
    assert.ok(responses.some((r: any) => /Echo: direct/.test(r.content)));
  } finally {
    await env.cleanup();
    await server.close();
  }
});
