import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import { parsePromptToolCalls, toPromptToolRequest, resolveToolCalling, generateWithPromptTools } from '../../src/engine/llm/promptToolCalling.ts';

const tools = [{ name: 'lookup', description: 'Weather', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'], additionalProperties: false } }];

test('mode: the agent choice wins, auto follows the capability', () => {
  assert.equal(resolveToolCalling(undefined, 'native'), 'native');
  assert.equal(resolveToolCalling('auto', 'prompt'), 'prompt');
  assert.equal(resolveToolCalling('prompt', 'native'), 'prompt');
  assert.equal(resolveToolCalling('native', 'prompt'), 'native');
  assert.equal(resolveToolCalling(undefined, 'none'), 'native');
});

test('parse: blocks, fenced JSON, multiple calls, and invalid ones', () => {
  const a = parsePromptToolCalls('Let me check.\n<tool_call>{"name":"lookup","arguments":{"city":"Tartu"}}</tool_call>', tools, 2);
  assert.deepEqual(a, { text: 'Let me check.', toolCalls: [{ id: 'prompt_2_0', name: 'lookup', args: { city: 'Tartu' } }], errors: [] });

  const fenced = parsePromptToolCalls('```json\n{"name":"lookup","arguments":{"city":"Riga"}}\n```', tools);
  assert.equal(fenced.toolCalls[0].args.city, 'Riga');
  assert.equal(parsePromptToolCalls('```json\n{"answer": 42}\n```', tools).toolCalls.length, 0, 'fenced JSON without a tool name is text');

  const two = parsePromptToolCalls('<tool_call>{"name":"lookup","arguments":{"city":"A"}}</tool_call><tool_call>{"name":"lookup","arguments":{"city":"B"}}</tool_call>', tools);
  assert.deepEqual(two.toolCalls.map((c) => c.args.city), ['A', 'B']);

  const bad = parsePromptToolCalls('<tool_call>{nope}</tool_call><tool_call>{"name":"shell","arguments":{}}</tool_call><tool_call>{"name":"lookup","arguments":{"town":"X"}}</tool_call>', tools);
  assert.equal(bad.toolCalls.length, 0);
  assert.equal(bad.errors.length, 3);
  assert.match(bad.errors[0], /not valid JSON/);
  assert.match(bad.errors[1], /unknown tool 'shell'/);
  assert.match(bad.errors[2], /required property 'city'|must NOT have additional/);
});

test('request conversion: tools move into the system prompt; tool turns become text', () => {
  const req = toPromptToolRequest({
    systemPrompt: 'Be brief',
    tools,
    messages: [
      { role: 'user', content: 'weather?' },
      { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'lookup', args: { city: 'Tartu' } }] },
      { role: 'tool', content: '{"temp":21}', toolName: 'lookup', toolCallId: '1' },
    ],
  });
  assert.equal(req.tools, undefined);
  assert.match(req.systemPrompt!, /^Be brief\n\n## Tools/);
  assert.match(req.systemPrompt!, /"name":"lookup"/);
  assert.deepEqual(req.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.match(req.messages[1].content, /<tool_call>\{"name":"lookup","arguments":\{"city":"Tartu"\}\}<\/tool_call>/);
  assert.match(req.messages[2].content, /^Tool result \(lookup\):/);
});

test('one corrective retry, then a visible tool error', async () => {
  const replies = ['<tool_call>{"name":"lookup","arguments":{}}</tool_call>', '<tool_call>{"name":"lookup","arguments":{"city":"Tartu"}}</tool_call>'];
  const sent: any[] = [];
  const ok = await generateWithPromptTools({ messages: [{ role: 'user', content: 'hi' }], tools }, async (r) => { sent.push(r); return { text: replies.shift()! }; });
  assert.equal(sent.length, 2);
  assert.match(sent[1].messages.at(-1).content, /could not be used/);
  assert.deepEqual(ok.toolCalls?.map((c) => c.args), [{ city: 'Tartu' }]);
  assert.equal(ok.finishReason, 'tool_use');

  const failed = await generateWithPromptTools({ messages: [{ role: 'user', content: 'hi' }], tools }, async () => ({ text: '<tool_call>{bad}</tool_call>' }));
  assert.equal(failed.toolCalls, undefined);
  assert.match(failed.text, /\[Tool call error\]/);
});

test('agent in prompt mode runs the tool and feeds the result back like native calls', async () => {
  const env = await createEnv('ptc_agent', { lookup: (a: any) => ({ city: a.city, temp: 21 }) });
  try {
    const llm = env.useLlm(['<tool_call>{"name":"lookup","arguments":{"city":"Tartu"}}</tool_call>', 'It is 21 in Tartu']);
    await runAst(env, { type: 'Curator_Agent', agentName: 'w', model: 'fake-model', prompt: 'weather?', tools: ['lookup'], tool_calling: 'prompt' });
    assert.deepEqual(env.calls, [{ tool: 'lookup', args: { city: 'Tartu' } }]);
    assert.equal(llm.requests[0].tools, undefined, 'no native tools sent');
    assert.match(String(llm.requests[0].systemPrompt), /<tool_call>/);
    assert.match(llm.requests[1].messages.at(-1)!.content, /^Tool result \(lookup\):\n\{"city":"Tartu","temp":21\}/);
    const last = (await env.prisma.response.findMany({ orderBy: { id: 'asc' } })).at(-1);
    assert.equal(last.content, 'It is 21 in Tartu');
  } finally {
    await env.cleanup();
  }
});
