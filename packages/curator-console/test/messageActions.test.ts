import test from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import { messageActionArgs, useMessageActions } from '../src/composables/useMessageActions.ts';

const save = { name: 'save_note', parameters: { properties: { text: {}, requestId: {} } }, ui: { messageAction: { label: 'Save as note' } } };
const userOnly = { name: 'translate', parameters: { properties: { text: {} } }, ui: { messageAction: { label: 'Translate', appliesTo: ['user'] } } };
const plain = { name: 'lookup', parameters: { properties: { q: {} } } };

test('messageActionArgs passes only the declared message fields', () => {
  assert.deepEqual(messageActionArgs(save, { text: 'hi', requestId: '42', conversationId: 3 }), { text: 'hi', requestId: 42 });
  assert.deepEqual(messageActionArgs(userOnly, { text: 'hi', requestId: null }), { text: 'hi' });
  assert.deepEqual(messageActionArgs(save, { text: 'hi', requestId: 'not-a-number' }), { text: 'hi' });
});

test('useMessageActions lists tools per role and runs them through the tool runner', async () => {
  const calls: any[] = [];
  const actions = useMessageActions(ref([save, userOnly, plain]) as any, async (name, args) => {
    calls.push([name, args]);
    if (name === 'translate') throw new Error('denied');
    return { saved: true };
  });
  assert.deepEqual(actions.actionsFor('assistant').map((t) => t.name), ['save_note']);
  assert.deepEqual(actions.actionsFor('user').map((t) => t.name), ['translate']);
  assert.deepEqual(await actions.run(save, { text: 'hi', requestId: 7 }), { ok: true, result: { saved: true } });
  assert.deepEqual(calls[0], ['save_note', { text: 'hi', requestId: 7 }]);
  assert.equal((await actions.run(userOnly, { text: 'x' })).ok, false);
  assert.equal(actions.error.value, 'denied');
});
