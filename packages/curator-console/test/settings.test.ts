import test from 'node:test';
import assert from 'node:assert/strict';
import { schemaField, schemaFields, isFormSchema, parseFieldInput, formatFieldValue } from '../src/composables/useSchemaForm.ts';
import { usePluginConfig } from '../src/composables/usePluginConfig.ts';

test('schema fields: kinds, required, form detection', () => {
  const fields = schemaFields({
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', title: 'Name' },
      count: { type: 'integer' },
      ratio: { type: 'number' },
      on: { type: 'boolean' },
      mode: { enum: ['a', 'b'] },
      key: { type: 'string', format: 'secret' },
      tags: { type: 'array', items: { type: 'string' } },
    },
  });
  assert.deepEqual(fields.map((f) => [f.key, f.kind, f.required]), [
    ['name', 'string', true], ['count', 'integer', false], ['ratio', 'number', false], ['on', 'boolean', false],
    ['mode', 'enum', false], ['key', 'secret', false], ['tags', 'json', false],
  ]);
  assert.equal(fields[0].label, 'Name');
  assert.equal(isFormSchema({ type: 'object', properties: { a: { type: 'string' } } }), true);
  assert.equal(isFormSchema({ type: 'array' }), false);
});

test('parsing inputs per kind', () => {
  assert.deepEqual(parseFieldInput(schemaField('n', { type: 'integer' }), '42'), { value: 42 });
  assert.match(parseFieldInput(schemaField('n', { type: 'integer' }), '4.2').error!, /whole number/);
  assert.match(parseFieldInput(schemaField('k', { type: 'string', format: 'secret' }), 'sk-live-123').error!, /secret reference/);
  assert.deepEqual(parseFieldInput(schemaField('k', { type: 'string', format: 'secret' }), ' secret://API_KEY '), { value: 'secret://API_KEY' });
  assert.deepEqual(parseFieldInput(schemaField('t', { type: 'array' }), '["a"]'), { value: ['a'] });
  assert.match(parseFieldInput(schemaField('t', { type: 'array' }), '[').error!, /not valid JSON/);
  assert.deepEqual(parseFieldInput(schemaField('s', { type: 'string' }), ''), { value: undefined });
  assert.equal(formatFieldValue(schemaField('t', { type: 'object' }), { a: 1 }), '{\n  "a": 1\n}');
});

test('usePluginConfig loads, saves and resets through the config tools', async () => {
  const calls: any[] = [];
  const config = usePluginConfig(async (name, args) => {
    calls.push([name, args]);
    if (name === 'config_get') return { namespaces: [{ namespace: 'demo', keys: [] }] };
    if (args.scope === 'system') throw new Error("Saving system config needs the 'config:system' role");
    return { saved: true };
  });
  await config.load();
  assert.equal(config.namespaces.value[0].namespace, 'demo');
  assert.equal(await config.save('demo', 'greeting', 'user', 'Hi'), true);
  assert.deepEqual(calls[1], ['config_set', { namespace: 'demo', key: 'greeting', scope: 'user', value: 'Hi' }]);
  assert.equal(calls[2][0], 'config_get', 'reloads after a save');
  assert.equal(await config.save('demo', 'greeting', 'system', 'X'), false);
  assert.match(String(config.error.value), /config:system/);
  assert.equal(await config.reset('demo', 'greeting', 'user'), true);
  assert.deepEqual(calls.at(-2), ['config_unset', { namespace: 'demo', key: 'greeting', scope: 'user' }]);
});
