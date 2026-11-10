import test from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import { useAttachments, promptWithAttachments } from '../src/composables/useAttachments.ts';

const tools = (names: string[]) => ref(names.map((name) => ({ name })));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('attachments: offered only when search_resources and attach_resource are both allowed', () => {
  assert.equal(useAttachments(tools(['search_resources']), async () => ({})).available.value, false);
  assert.equal(useAttachments(tools(['search_resources', 'attach_resource']), async () => ({})).available.value, true);
});

test('attachments: # search fills suggestions; attachAll attaches each chip and clears them', async () => {
  const calls: any[] = [];
  const run = async (name: string, args: any) => {
    calls.push({ name, args });
    if (name === 'search_resources') return { resources: [{ id: 7, uri: 'doc:a', title: 'Doc A' }, { uri: 'doc:b' }] };
    if (args.uri === 'doc:b') return { attached: false };
    return { attached: true, resource: { id: 7, uri: 'doc:a', title: 'Doc A' }, excerpt: 'Hello' };
  };
  const a = useAttachments(tools(['search_resources', 'attach_resource']), run);
  a.search('doc');
  await wait(260);
  assert.deepEqual(a.hits.value.map((h) => [h.name, h.source]), [['Doc A', 'resource'], ['doc:b', 'resource']]);
  assert.deepEqual(calls[0], { name: 'search_resources', args: { query: 'doc', limit: 8 } });

  a.add(a.hits.value[0].value as any);
  a.add(a.hits.value[0].value as any); // no duplicates
  a.add(a.hits.value[1].value as any);
  assert.equal(a.attachments.value.length, 2);
  const attached = await a.attachAll();
  assert.deepEqual(attached, [{ uri: 'doc:a', title: 'Doc A', id: 7, excerpt: 'Hello' }]);
  assert.match(String(a.error.value), /doc:b/);
  assert.equal(a.attachments.value.length, 0);
  assert.deepEqual(calls.filter((c) => c.name === 'attach_resource').map((c) => c.args), [{ id: 7 }, { uri: 'doc:b' }]);
});

test('attachments: the prompt carries an Attached block', () => {
  assert.equal(promptWithAttachments('hi', []), 'hi');
  const text = promptWithAttachments('Summarize', [{ uri: 'doc:a', title: 'Doc A', excerpt: 'Hello' }]);
  assert.equal(text, ['Summarize', '', 'Attached:', '### Doc A (doc:a)', 'Hello'].join('\n'));
});
