import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVER_NAME_PATTERN, accessLevelFromAnnotations, parseToolAlias, toolAlias, toolKey } from '../dist/naming.js';

test('aliases and project-qualified keys', () => {
  assert.equal(toolAlias('crm', 'lookup'), 'mcp.crm.lookup');
  assert.equal(toolKey('p1', 'crm', 'lookup'), 'mcp.crm.lookup@p1');
  assert.deepEqual(parseToolAlias('mcp.crm.accounts.search'), { server: 'crm', remoteName: 'accounts.search' });
  assert.equal(parseToolAlias('mcp.crm.lookup@p1'), null);
  assert.equal(parseToolAlias('mcp.crm'), null);
  assert.equal(parseToolAlias('local_tool'), null);
});

test('server names cannot contain alias separators', () => {
  assert.ok(SERVER_NAME_PATTERN.test('crm-eu_2'));
  assert.ok(!SERVER_NAME_PATTERN.test('crm.eu'));
  assert.ok(!SERVER_NAME_PATTERN.test('crm@p1'));
  assert.ok(!SERVER_NAME_PATTERN.test(''));
});

test('annotations set the initial access level; unannotated uses the fallback', () => {
  assert.equal(accessLevelFromAnnotations({ readOnlyHint: true }, 'elevated'), 'read_only');
  assert.equal(accessLevelFromAnnotations({ destructiveHint: true }, 'elevated'), 'destructive');
  assert.equal(accessLevelFromAnnotations({ destructiveHint: false }, 'elevated'), 'safe_write');
  assert.equal(accessLevelFromAnnotations(undefined, 'elevated'), 'elevated');
});
