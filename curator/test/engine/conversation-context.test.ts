import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, runAst } from '../helpers/harness.ts';
import {
  ConversationContextBuilder,
  loadConversationEntries,
  type ConversationEntry,
} from '../../src/engine/llm/ConversationContext.ts';

const say = (speaker: string, text: string, extra: Partial<ConversationEntry> = {}): ConversationEntry =>
  ({ speaker, mode: 'say', text, ...extra });

test('context: own turns are assistant, others are labelled user turns, in order', () => {
  const b = new ConversationContextBuilder({ system: 'You are b.' }).pushAll([
    say('human', 'hello all', { mode: 'human' }),
    say('a', 'hi'),
    say('b', 'hey'),
    say('c', 'yo'),
  ]);
  assert.deepEqual(b.build('b'), {
    systemPrompt: 'You are b.',
    messages: [
      { role: 'user', content: '[human]: hello all' },
      { role: 'user', content: '[a]: hi' },
      { role: 'assistant', content: 'hey' },
      { role: 'user', content: '[c]: yo' },
    ],
  });
});

test('context: a whisper is visible only to its speaker and audience, never to bystanders', () => {
  const b = new ConversationContextBuilder().pushAll([
    say('a', 'to everyone'),
    say('a', 'secret for b', { mode: 'whisper', audience: ['b'] }),
    say('c', 'also public'),
  ]);
  const texts = (viewer: string) => b.build(viewer).messages.map((m) => m.content);
  assert.deepEqual(texts('b'), ['[a]: to everyone', '[a whispers]: secret for b', '[c]: also public']);
  assert.deepEqual(texts('a'), ['to everyone', 'secret for b', '[c]: also public'], 'the whisperer sees its own whisper as an assistant turn');
  assert.deepEqual(texts('c'), ['[a]: to everyone', 'also public'], 'c never sees the whisper');
});

test('context: tool output stays private to the agent that ran it', () => {
  const b = new ConversationContextBuilder().pushAll([
    { speaker: 'a', mode: 'tool', text: '42', audience: ['a'], meta: { toolName: 'calc' } },
    say('a', 'the answer is 42'),
  ]);
  assert.deepEqual(b.build('a').messages, [
    { role: 'tool', toolName: 'calc', content: '42' },
    { role: 'assistant', content: 'the answer is 42' },
  ]);
  assert.deepEqual(b.build('b').messages, [{ role: 'user', content: '[a]: the answer is 42' }]);
});

test('context: a use case adds a speech mode by registering a renderer; limit keeps the latest messages', () => {
  const b = new ConversationContextBuilder({
    limit: 2,
    label: (s) => s.toUpperCase(),
    renderers: { shout: (e, ctx) => ({ role: 'user', content: `[${ctx.label(e.speaker)} SHOUTS]: ${e.text.toUpperCase()}` }) },
  }).pushAll([say('a', 'one'), say('a', 'two'), { speaker: 'c', mode: 'shout', text: 'stop' }, say('c', 'sorry')]);
  assert.deepEqual(b.build('b').messages, [
    { role: 'user', content: '[C SHOUTS]: STOP' },
    { role: 'user', content: '[C]: sorry' },
  ]);
  assert.deepEqual(new ConversationContextBuilder().push({ speaker: 'a', mode: 'unknown', text: 'x' }).build('b').messages, [], 'unknown modes are skipped, not guessed');
});

// The same rules, driven from the stored Request/Response/EventLog rows.
test('context from stored rows: bus events, whispers and an agent reply build each participant\'s view', async () => {
  const env = await createEnv('ctx_rows');
  try {
    env.useLlm(['Noted.']);
    await runAst(env, { type: 'Curator_Agent', agentName: 'c', prompt: 'ping' } as any);
    const emit = (eventName: string, payload: any, targetAgentId?: string) =>
      env.processor.emitEventRequest({
        eventName, payload, targetAgentId,
        conversationId: env.conversationId, userId: env.userId, origin: 'API',
      });
    await emit('say', { from: 'a', text: 'hello all' });
    await emit('say', { from: 'a', mode: 'whisper', text: 'psst b' }, 'b');
    await emit('say', { from: 'b', text: 'hi a' });

    const entries = await loadConversationEntries(env.prisma, env.conversationId, { eventNames: ['say'] });
    const builder = new ConversationContextBuilder({ system: 'shared room' }).pushAll(entries);
    const view = (who: string) => builder.build(who).messages.map((m) => m.content);

    assert.deepEqual(view('b'), ['[c]: Noted.', '[a]: hello all', '[a whispers]: psst b', 'hi a']);
    assert.ok(!view('c').some((t) => t.includes('psst')), 'c (an agent in the room) never sees the whisper');
    assert.deepEqual(view('c')[0], 'Noted.', 'c sees its own earlier reply as an assistant turn');
    assert.equal(builder.build('a').systemPrompt, 'shared room');
  } finally {
    await env.cleanup();
  }
});
