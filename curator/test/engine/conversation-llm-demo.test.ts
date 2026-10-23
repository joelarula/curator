import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeLlm } from '../helpers/harness.ts';
import { ConversationContextBuilder, type ConversationEntry } from '../../src/engine/llm/ConversationContext.ts';

// Prints the emulated LLM request/response pairs of a three-agent room (run with DEMO=1 to see them).
test('demo: each agent turn sends its own view to the LLM and the reply joins the shared history', async () => {
  const replies: Record<string, string> = { a: 'Hi all, I am A.', b: 'B here. A, nice to meet you.', c: 'C: I heard the whisper? No - only public lines.' };
  const fake = makeFakeLlm((req, i) => replies['abc'[i % 3]]);
  const builder = new ConversationContextBuilder({ system: 'You are in a room with a, b and c. Reply briefly.' });
  const log: any[] = [];

  const push = (e: ConversationEntry) => builder.push(e);
  push({ speaker: 'human', mode: 'human', text: 'Please introduce yourselves.' });
  push({ speaker: 'human', mode: 'whisper', text: 'b, keep it short', audience: ['b'] });

  for (const agent of ['a', 'b', 'c']) {
    const view = builder.build(agent);
    const response = await fake.provider.generateContent({ systemPrompt: view.systemPrompt, messages: view.messages } as any);
    log.push({ agent, request: view, response });
    push({ speaker: agent, mode: 'say', text: response.text });
  }

  if (process.env.DEMO) console.log(JSON.stringify(log, null, 2));

  assert.equal(fake.requests.length, 3);
  assert.equal(log[0].request.messages.length, 1, 'a sees only the public question');
  assert.equal(log[1].request.messages.length, 3, 'b sees question + whisper + a');
  assert.equal(log[2].request.messages.length, 3, 'c sees question + a + b, no whisper');
  assert.ok(!JSON.stringify(log[2].request).includes('keep it short'));
});
