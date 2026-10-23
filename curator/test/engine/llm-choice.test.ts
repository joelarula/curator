import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst, compileFixture } from '../helpers/harness.ts';
import { defineTool } from '../../src/tools/CuratorTool.ts';

// The model is offered fold / call / raise as tools (CoffeeScript fixture -> AST) and must choose by calling one.
// The "model" is scripted, so these tests pin down what the engine sends and how it handles each kind of answer.
const ALL = ['fold', 'call', 'raise'];

async function setup(name: string) {
  const env = await createEnv(name);
  const taken: { tool: string; args: any }[] = [];
  const tools = (env.processor as any).engine.tools as Map<string, any>;
  const add = (toolName: string, parameters: any, check?: (a: any) => void) =>
    tools.set(
      toolName,
      defineTool({
        name: toolName,
        description: `Poker action: ${toolName}`,
        parameters,
        execute: async (args: any) => {
          check?.(args);
          taken.push({ tool: toolName, args });
          return JSON.stringify({ ok: true, action: toolName, ...args });
        },
      } as any),
    );
  add('fold', { type: 'object', properties: {} });
  add('call', { type: 'object', properties: {} });
  add('raise', { type: 'object', properties: { amount: { type: 'integer', minimum: 10, maximum: 500 } }, required: ['amount'] }, (a) => {
    if (!Number.isInteger(a.amount) || a.amount < 10 || a.amount > 500) throw new Error('amount must be an integer between 10 and 500');
  });
  return { env, taken };
}

const toolMessages = (req: any) => req.messages.filter((m: any) => m.role === 'tool');

test('choice: every option is offered as a tool with its schema, and the prompt asks for one action', async () => {
  const { env } = await setup('choice_offer');
  try {
    const llm = env.useLlm([{ toolCalls: [{ name: 'fold' }] }, 'Folded.']);
    await runAst(env, await compileFixture('choose_action.coffee'));
    const first = llm.requests[0];
    assert.deepEqual(first.tools?.map((t) => t.name), ALL);
    const raise = first.tools!.find((t) => t.name === 'raise')!;
    assert.deepEqual((raise.parameters as any).required, ['amount']);
    assert.equal((raise.parameters as any).properties.amount.minimum, 10);
    assert.match(String(first.systemPrompt), /exactly one action/);
    assert.deepEqual(first.messages, [{ role: 'user', content: 'Pot is 100, you hold a pair of kings. What do you do?' }]);
  } finally {
    await env.cleanup();
  }
});

test('choice: the chosen option runs once with the model\'s arguments and the result goes back to the model', async () => {
  const { env, taken } = await setup('choice_pick');
  try {
    const llm = env.useLlm([{ toolCalls: [{ name: 'raise', args: { amount: 50 } }] }, 'I raised 50.']);
    await runAst(env, await compileFixture('choose_action.coffee'));
    assert.deepEqual(taken, [{ tool: 'raise', args: { amount: 50 } }], 'only the chosen option ran');
    assert.equal(llm.requests.length, 2);
    const [result] = toolMessages(llm.requests[1]);
    assert.equal(result.toolName, 'raise');
    assert.equal(result.isError, false);
    assert.deepEqual(JSON.parse(result.content), { ok: true, action: 'raise', amount: 50 });
    const assistant = llm.requests[1].messages.find((m: any) => m.role === 'assistant');
    assert.equal(assistant?.toolCalls?.[0].name, 'raise', 'the model\'s own choice is kept in the history');
  } finally {
    await env.cleanup();
  }
});

test('choice: a text-only answer is a final answer and no option runs', async () => {
  const { env, taken } = await setup('choice_text');
  try {
    const llm = env.useLlm(['I think I will fold.']);
    await runAst(env, await compileFixture('choose_action.coffee'));
    assert.deepEqual(taken, []);
    assert.equal(llm.requests.length, 1, 'the engine does not re-prompt for a missing choice');
  } finally {
    await env.cleanup();
  }
});

test('choice: invalid arguments come back as a tool error and the model can correct its choice', async () => {
  const { env, taken } = await setup('choice_retry');
  try {
    const llm = env.useLlm([
      { toolCalls: [{ name: 'raise', args: { amount: 9999 } }] },
      { toolCalls: [{ name: 'raise', args: { amount: 200 } }] },
      'Raised 200.',
    ]);
    await runAst(env, await compileFixture('choose_action.coffee'));
    const [bad] = toolMessages(llm.requests[1]);
    assert.equal(bad.isError, true);
    assert.match(bad.content, /between 10 and 500/);
    const results = toolMessages(llm.requests[2]);
    assert.deepEqual(results.map((m: any) => m.isError), [true, false], 'the failed attempt stays visible, the retry succeeds');
    assert.deepEqual(taken, [{ tool: 'raise', args: { amount: 200 } }]);
  } finally {
    await env.cleanup();
  }
});

test('choice: a registered tool that was not offered is not executed', async () => {
  const { env, taken } = await setup('choice_not_offered');
  try {
    const tools = (env.processor as any).engine.tools as Map<string, any>;
    tools.set('all_in', defineTool({ name: 'all_in', description: 'not part of this decision', parameters: { type: 'object', properties: {} }, execute: async () => { taken.push({ tool: 'all_in', args: {} }); return 'done'; } } as any));
    const llm = env.useLlm([{ toolCalls: [{ name: 'all_in' }] }, 'ok']);
    await runAst(env, await compileFixture('choose_action.coffee'));
    assert.deepEqual(llm.requests[0].tools?.map((t) => t.name), ALL, 'all_in was never offered');
    assert.deepEqual(taken, [], 'an option outside the offered set must not run');
    assert.equal(toolMessages(llm.requests[1])[0].isError, true);
  } finally {
    await env.cleanup();
  }
});
