import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileTokenStore } from '../dist/index.js';

test('FileTokenStore round-trips sessions and lists keys', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'curator-auth-'));
  try {
    const store = new FileTokenStore(dir);
    const session = { issuer: 'https://a', clientId: 'c', accessTokens: { '*': { accessToken: 't' } }, updatedAt: 1 };
    assert.equal(await store.get('https://a#c'), null);
    await store.set('https://a#c', session);
    await store.set('https://b#c', { ...session, issuer: 'https://b' });
    assert.deepEqual(await store.get('https://a#c'), session);
    assert.deepEqual((await store.keys()).sort(), ['https://a#c', 'https://b#c']);
    assert.equal((await readdir(dir)).filter((f) => f.endsWith('.tmp')).length, 0);
    await store.delete('https://a#c');
    assert.equal(await store.get('https://a#c'), null);
    assert.deepEqual(await store.keys(), ['https://b#c']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('FileTokenStore on a missing directory is empty', async () => {
  const store = new FileTokenStore(path.join(os.tmpdir(), `curator-auth-missing-${Date.now()}`));
  assert.deepEqual(await store.keys(), []);
  assert.equal(await store.get('x'), null);
});
