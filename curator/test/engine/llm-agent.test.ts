import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, snapshotDb, assertGolden } from '../helpers/harness.ts';

const agent = (extra: any = {}) => ({ type: 'Curator_Agent', agentName: 'a', model: 'fake-model', prompt: 'hello', ...extra });

async function status(env: any, id: number) {
  return (await env.prisma.request.findUnique({ where: { id } })).status;
}

test('llm: direct agent sends prompt/instruction and stores the reply', async () => {
  const env = await createEnv('llm_direct');
  try {
    const llm = env.useLlm(['pong']);
    const { requestId, result } = await runAst(env, agent({ instruction: 'be brief', prompt: 'ping' }));
    assert.equal(result.done, true);
    assert.equal(await status(env, requestId), 'COMPLETED');
    assert.equal(llm.requests.length, 1);
    assert.equal(llm.requests[0].systemPrompt, 'be brief');
    assert.equal(llm.requests[0].model, 'fake-model');
    assert.deepEqual(llm.requests[0].messages, [{ role: 'user', content: 'ping' }]);
    assert.deepEqual((await snapshotDb(env)).responses.map((r: any) => r.content), ['pong']);
  } finally {
    await env.cleanup();
  }
});

test('llm: agentic loop runs the requested tool and feeds the result back', async () => {
  const env = await createEnv('llm_tools', { lookup: (a: any) => ({ city: a.city, temp: 21 }) });
  try {
    const llm = env.useLlm([
      { toolCalls: [{ name: 'lookup', args: { city: 'Tartu' } }] },
      'It is 21 in Tartu',
    ]);
    const { requestId } = await runAst(env, agent({ tools: ['lookup'] }));
    assert.equal(await status(env, requestId), 'COMPLETED');
    assert.deepEqual(env.calls, [{ tool: 'lookup', args: { city: 'Tartu' } }]);
    assert.equal(llm.requests.length, 2);
    assert.deepEqual(llm.requests[0].tools?.map((t) => t.name), ['lookup']);
    const toolMsg = llm.requests[1].messages.find((m) => m.role === 'tool');
    assert.equal(toolMsg?.content, '{"city":"Tartu","temp":21}');
    assertGolden('llm/agentic_tool.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});

test('llm: an unknown tool call is reported to the model as an error, not a crash', async () => {
  const env = await createEnv('llm_badtool');
  try {
    const llm = env.useLlm([{ toolCalls: [{ name: 'nope' }] }, 'recovered']);
    const { requestId } = await runAst(env, agent({ tools: ['nope'] }));
    assert.equal(await status(env, requestId), 'COMPLETED');
    const toolMsg = llm.requests[1].messages.find((m) => m.role === 'tool');
    assert.equal(toolMsg?.isError, true);
    assert.match(String(toolMsg?.content), /not found/);
  } finally {
    await env.cleanup();
  }
});

test('llm: a tool needing approval parks the agent WAITING_FOR_USER', async () => {
  const env = await createEnv('llm_approval', { danger: () => 'done' });
  try {
    const t = (env.processor as any).engine.tools.get('danger');
    t.requiresHumanApproval = t.requiresConfirmation = true;
    env.useLlm([{ toolCalls: [{ name: 'danger', args: { x: 1 } }] }]);
    const { requestId, result } = await runAst(env, agent({ tools: ['danger'] }));
    assert.equal(result.waiting, true);
    assert.equal(await status(env, requestId), 'WAITING_FOR_USER');
    assert.equal(env.calls.length, 0);
  } finally {
    await env.cleanup();
  }
});

test('llm: runaway tool loop stops after 10 turns', async () => {
  const env = await createEnv('llm_loop', { spin: () => 'ok' });
  try {
    const llm = env.useLlm(() => ({ toolCalls: [{ name: 'spin' }] }));
    const { requestId } = await runAst(env, agent({ tools: ['spin'] }));
    assert.equal(await status(env, requestId), 'COMPLETED');
    assert.equal(llm.requests.length, 10);
  } finally {
    await env.cleanup();
  }
});

test('llm: provider failure is surfaced and does not hang the processor', async () => {
  const env = await createEnv('llm_fail');
  try {
    env.useLlm([]);
    const { requestId, result } = await runAst(env, agent());
    assert.equal(result.done, true);
    assert.notEqual(await status(env, requestId), 'NEW');
  } finally {
    await env.cleanup();
  }
});

test('llm: input_schema violation short-circuits before calling the model', async () => {
  const env = await createEnv('llm_schema_in');
  try {
    const llm = env.useLlm(['unused']);
    await runAst(env, agent({ input_schema: { type: 'object', required: ['name'] } }));
    assert.equal(llm.requests.length, 0);
    const responses = await env.prisma.response.findMany({ where: { conversationId: env.conversationId } });
    assert.match(responses[0].content, /input_schema validation failed/);
  } finally {
    await env.cleanup();
  }
});

test('llm: output_schema requests JSON output and appends the schema to the instruction', async () => {
  const env = await createEnv('llm_schema_out');
  try {
    const llm = env.useLlm(['{"ok":true}']);
    await runAst(env, agent({ instruction: 'base', output_schema: { type: 'object', properties: { ok: { type: 'boolean' } } } }));
    assert.equal(llm.requests[0].jsonOutput, true);
    assert.match(String(llm.requests[0].systemPrompt), /^base\n\nYou must respond with a JSON object/);
  } finally {
    await env.cleanup();
  }
});

// ---- Converted legacy scripts (history handling, interpolation) ----

const load = async (name: string) => (await import(`../fixtures/ast/${name}.ts`)).run();

test('ast/include_contents: later agents see history unless include_contents is none', async () => {
  const env = await createEnv('llm_include');
  try {
    const llm = env.useLlm(['Noted.', 'Alice', 'I do not know']);
    const { result } = await runAst(env, await load('include_contents'));
    assert.equal(result.done, true);
    assert.equal(llm.requests.length, 3);
    assert.equal(llm.requests[0].messages.length, 1);
    assert.equal(llm.requests[1].messages.length, 3);
    assert.match(llm.requests[1].messages[0].content, /name is Alice/);
    assert.equal(llm.requests[1].messages[1].content, 'Noted.');
    assert.equal(llm.requests[2].messages.length, 1);
    assertGolden('ast/include_contents.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});

test('ast/exclude_from_history: excluded step never reaches later prompts', async () => {
  const env = await createEnv('llm_exclude');
  try {
    const llm = env.useLlm(['Hi Bob', 'Nice', 'Bob']);
    await runAst(env, await load('exclude_from_history'));
    assert.equal(llm.requests.length, 3);
    const lastPrompts = llm.requests[2].messages.map((m) => m.content).join('\n');
    assert.match(lastPrompts, /Bob/);
    assert.doesNotMatch(lastPrompts, /fishing/);
    assertGolden('ast/exclude_from_history.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});

test('ast/interpolation: state is interpolated into instruction/prompt and schema is enforced', async () => {
  const env = await createEnv('llm_interp');
  try {
    const llm = env.useLlm(['{"greeting":"hello","limitUsed":42}']);
    const { result } = await runAst(env, await load('interpolation'));
    assert.equal(result.done, true);
    assert.equal(llm.requests.length, 1);
    assert.match(String(llm.requests[0].systemPrompt), /You are an Master Curator/);
    assert.match(llm.requests[0].messages.at(-1)!.content, /The limit is 42/);
    assert.equal(llm.requests[0].jsonOutput, true);
    assertGolden('ast/interpolation.db.json', await snapshotDb(env));
  } finally {
    await env.cleanup();
  }
});
