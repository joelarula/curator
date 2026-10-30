import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, compileFixture } from '../helpers/harness.ts';
import { defineTool } from '../../src/tools/CuratorTool.ts';

// The set of choices is not fixed in the AST: `tools: '$state.options'` is evaluated on every agent turn.
const ACTIONS = ['fold', 'call', 'raise', 'check', 'bet'];

async function setup(name: string) {
  const env = await createEnv(name);
  const taken: string[] = [];
  const tools = (env.processor as any).engine.tools as Map<string, any>;
  for (const toolName of ACTIONS) {
    tools.set(toolName, defineTool({
      name: toolName,
      description: `Poker action: ${toolName}`,
      parameters: { type: 'object', properties: {} },
      execute: async () => { taken.push(toolName); return `${toolName} done`; },
    } as any));
  }
  return { env, taken };
}

const offered = (req: any) => (req.tools ?? []).map((t: any) => t.name);
const toolMessages = (req: any) => req.messages.filter((m: any) => m.role === 'tool');

test('dynamic choices: each turn offers the options that the state holds at that moment', async () => {
  const { env, taken } = await setup('dyn_offer');
  try {
    const llm = env.useLlm([
      { toolCalls: [{ name: 'call' }] }, 'Called.',
      { toolCalls: [{ name: 'bet' }] }, 'Bet.',
      'Good game.',
    ]);
    await runAst(env, await compileFixture('choose_dynamic.coffee'));
    const turnStarts = llm.requests.filter((r) => !toolMessages(r).length);
    assert.deepEqual(turnStarts.map(offered), [['fold', 'call', 'raise'], ['check', 'bet'], []]);
    assert.deepEqual(taken, ['call', 'bet']);
    assert.equal(llm.requests.at(-1)!.tools, undefined, 'an empty set means plain text, no tools are sent');
  } finally {
    await env.cleanup();
  }
});

test('dynamic choices: an option from an earlier turn is refused once it is no longer offered', async () => {
  const { env, taken } = await setup('dyn_stale');
  try {
    const llm = env.useLlm([
      { toolCalls: [{ name: 'call' }] }, 'Called.',
      { toolCalls: [{ name: 'call' }] }, 'Tried again.',
      'Done.',
    ]);
    await runAst(env, await compileFixture('choose_dynamic.coffee'));
    assert.deepEqual(taken, ['call'], 'the second "call" was not on offer (check/bet) and did not run');
    const refused = toolMessages(llm.requests[3])[0];
    assert.equal(refused.isError, true);
    assert.match(refused.content, /not found/);
  } finally {
    await env.cleanup();
  }
});

test('dynamic choices: options come from the flow context (loop item), one set per iteration', async () => {
  const { env, taken } = await setup('dyn_context');
  try {
    // A turn starts with the prompt last; earlier turns may replay their tool calls as history (history_profile 'full').
    const isTurnStart = (req: any) => req.messages.at(-1)?.role === 'user';
    const llm = env.useLlm((req: any) => (isTurnStart(req) ? { toolCalls: [{ name: req.tools[0].name }] } : 'ok'));
    await runAst(env, await compileFixture('choose_by_context.coffee'));
    const turnStarts = llm.requests.filter(isTurnStart);
    assert.deepEqual(turnStarts.map(offered), [['fold', 'call', 'raise'], ['check', 'bet'], ['fold']]);
    assert.deepEqual(taken, ['fold', 'check', 'fold'], 'each player acted from its own options');
  } finally {
    await env.cleanup();
  }
});

test('dynamic choices: a computed expression can filter the set by state', async () => {
  const { env } = await setup('dyn_computed');
  try {
    const llm = env.useLlm(['pick']);
    await runAst(env, await compileFixture('choose_computed.coffee'));
    assert.deepEqual(offered(llm.requests[0]), ['fold', 'call'], 'raise is withheld when the stack is below 20');
  } finally {
    await env.cleanup();
  }
});

test('dynamic choices: a non-array expression fails the agent with a clear error, not a silent empty set', async () => {
  const { env } = await setup('dyn_bad');
  try {
    const llm = env.useLlm(['unused']);
    await runAst(env, await compileFixture('choose_bad_expr.coffee'));
    assert.equal(llm.requests.length, 0, 'the model is never called with a wrong tool set');
    const requests = await env.prisma.request.findMany({ where: { conversationId: env.conversationId } });
    assert.ok(requests.some((r: any) => r.status === 'FAILED'), 'the flow fails');
    const rows = await env.prisma.response.findMany({ where: { conversationId: env.conversationId } });
    assert.ok(rows.some((r: any) => /must evaluate to an array/.test(r.content)), 'the failure names the cause');
  } finally {
    await env.cleanup();
  }
});
