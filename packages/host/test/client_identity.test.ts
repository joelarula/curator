import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileIdentityStore, deriveLocalUserId, resolveClientIdentity, validateDisplayName } from '../dist/index.js';

function tempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curator_identity_'));
  return { dir, store: new FileIdentityStore(dir), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('deriveLocalUserId formats slugs deterministically', () => {
  assert.equal(deriveLocalUserId('Alice'), 'user_alice');
  assert.equal(deriveLocalUserId('Bob The Shark!'), 'user_bob_the_shark');
  assert.equal(deriveLocalUserId(''), 'user_guest');
  assert.equal(deriveLocalUserId('', 'hero'), 'user_hero');
  assert.equal(deriveLocalUserId('  Charlie_99  '), 'user_charlie_99');
});

test('validateDisplayName enforces non-empty and length bounds', () => {
  assert.ok(validateDisplayName(''));
  assert.ok(validateDisplayName('A'));
  assert.equal(validateDisplayName('Al'), null);
  assert.ok(validateDisplayName('x'.repeat(25)));
});

test('FileIdentityStore saves, loads and clears one identity per app', () => {
  const { dir, store, cleanup } = tempStore();
  try {
    assert.equal(store.load('poker'), null);

    const saved = store.save('poker', { displayName: ' Maverick ' });
    assert.equal(saved.displayName, 'Maverick');
    assert.equal(saved.userId, 'user_maverick');
    assert.ok(fs.existsSync(path.join(dir, 'poker.json')));
    assert.equal(store.load('chess'), null, 'identities are scoped per app');

    const renamed = store.save('poker', { displayName: 'Goose' });
    assert.equal(renamed.createdAt, saved.createdAt, 'createdAt survives updates');
    assert.equal(store.load('poker')?.displayName, 'Goose');

    store.clear('poker');
    assert.equal(store.load('poker'), null);
  } finally {
    cleanup();
  }
});

test('resolveClientIdentity: explicit name overrides and is saved', async () => {
  const { store, cleanup } = tempStore();
  try {
    store.save('poker', { displayName: 'Vesper' });
    const identity = await resolveClientIdentity({ appId: 'poker', displayName: 'HighRoller', store, quiet: true });
    assert.equal(identity.source, 'flag');
    assert.equal(identity.userId, 'user_highroller');
    assert.equal(store.load('poker')?.displayName, 'HighRoller');
  } finally {
    cleanup();
  }
});

test('resolveClientIdentity: uses stored identity without prompting', async () => {
  const { store, cleanup } = tempStore();
  try {
    store.save('poker', { displayName: 'Vesper' });
    const identity = await resolveClientIdentity({ appId: 'poker', store, quiet: true, interactive: true });
    assert.equal(identity.source, 'stored');
    assert.equal(identity.displayName, 'Vesper');
    assert.equal(identity.userId, 'user_vesper');
  } finally {
    cleanup();
  }
});

test('resolveClientIdentity: authenticated identity wins over stored identity', async () => {
  const { store, cleanup } = tempStore();
  try {
    store.save('poker', { displayName: 'Vesper' });
    const auth: any = { whoami: async () => ({ issuer: 'https://idp', sub: 'abc', name: 'Jane Doe' }) };
    const identity = await resolveClientIdentity({ appId: 'poker', store, quiet: true, auth, authTarget: 'corp' });
    assert.equal(identity.source, 'auth');
    assert.equal(identity.displayName, 'Jane Doe');
    assert.equal(identity.userId, 'user_jane_doe');
  } finally {
    cleanup();
  }
});

test('resolveClientIdentity: non-interactive fallback is not saved', async () => {
  const { store, cleanup } = tempStore();
  try {
    const identity = await resolveClientIdentity({ appId: 'poker', store, interactive: false, fallbackName: 'Hero' });
    assert.equal(identity.source, 'default');
    assert.equal(identity.userId, 'user_hero');
    assert.equal(store.load('poker'), null);
  } finally {
    cleanup();
  }
});
