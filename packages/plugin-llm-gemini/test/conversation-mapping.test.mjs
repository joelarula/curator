import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiLlmProvider } from '../dist/GeminiLlmProvider.js';

// Messages shaped like the output of curator's ConversationContextBuilder / foldConversation for viewer "b".
const prompt = [
  { role: 'user', content: '[human]: hello all' },
  { role: 'user', content: '[a]: hi' },
  { role: 'assistant', content: 'hey' },
  { role: 'user', content: '[c]: yo' },
  { role: 'tool', toolName: 'calc', content: '42' },
];

const map = (messages) => new GeminiLlmProvider('test-key').formatGeminiContents(messages);

test('conversation mapping: other participants stay labelled user turns, own turns become model turns', () => {
  assert.deepEqual(map(prompt), [
    { role: 'user', parts: [{ text: '[human]: hello all' }] },
    { role: 'user', parts: [{ text: '[a]: hi' }] },
    { role: 'model', parts: [{ text: 'hey' }] },
    { role: 'user', parts: [{ text: '[c]: yo' }] },
    { role: 'user', parts: [{ functionResponse: { name: 'calc', response: { output: '42', isError: false } } }] },
  ]);
});

test('conversation mapping: the system prompt never enters contents (it travels as systemInstruction)', () => {
  const withSystem = [{ role: 'system', content: 'You are b.' }, ...prompt];
  assert.deepEqual(map(withSystem), map(prompt));
});

test('conversation mapping: a history that starts with the agent\'s own turn gets a leading user turn', () => {
  const contents = map([{ role: 'assistant', content: 'I speak first' }, { role: 'user', content: '[a]: ok' }]);
  assert.deepEqual(contents[0], { role: 'user', parts: [{ text: '[Conversation Started]' }] });
  assert.equal(contents[1].role, 'model');
});

test('conversation mapping: appending messages leaves earlier contents byte-identical (stable cache prefix)', () => {
  const before = JSON.stringify(map(prompt));
  const after = map([...prompt, { role: 'user', content: '[a]: and again' }, { role: 'assistant', content: 'noted' }]);
  assert.equal(JSON.stringify(after.slice(0, prompt.length)), before);
  assert.equal(after.length, prompt.length + 2);
});
