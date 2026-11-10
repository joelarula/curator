import test from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';
import { parseComposerInput } from '@curator/host/contracts';
import { useCommandCatalog, HARNESS_COMMANDS } from '../src/composables/useCommandCatalog.ts';

test('catalog merges harness verbs, tools, choices and agents; suggestions follow the cursor', () => {
  const tools = ref<any[]>([{ name: 'search_knowledge', description: 'Search', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }]);
  const agents = ref<any[]>([{ name: 'weather', title: 'Weather bot' }]);
  const choices = ref([{ label: 'Approve', value: 'yes' }]);
  const c = useCommandCatalog({ tools, agents, choices });

  assert.equal(c.commands.value.length, HARNESS_COMMANDS.length);
  assert.deepEqual(c.catalog.value.filter((e) => e.source !== 'command').map((e) => `${e.source}:${e.name}`), ['tool:search_knowledge', 'choice:1', 'agent:weather']);
  assert.equal(c.catalog.value.find((e) => e.name === 'search_knowledge')?.usage, '<query>');

  assert.deepEqual(c.suggest('/se', 3).items.map((e) => e.name), ['search_knowledge', 'pause'], 'prefix matches first, then names containing it');
  assert.deepEqual(c.suggest('/yes', 4).items.map((e) => e.name), ['1'], 'choices match by value');
  assert.deepEqual(c.suggest('ask @wea', 8).items.map((e) => e.name), ['weather']);
  assert.deepEqual(c.suggest('plain text', 10).items, []);

  // The same list parses what is submitted
  assert.equal(parseComposerInput('/res', c.catalog.value).kind, 'command');
  assert.deepEqual((parseComposerInput('/search_knowledge', c.catalog.value) as any).missing, ['query']);
  assert.equal(parseComposerInput('/yes', c.catalog.value).kind, 'choice');
  tools.value = [];
  assert.equal(parseComposerInput('/search_knowledge cats', c.catalog.value).kind, 'unknown', 'the list follows its sources');
});
