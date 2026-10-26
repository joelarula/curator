import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  derivePlayerId,
  loadPlayerProfile,
  savePlayerProfile,
  clearPlayerProfile,
  resolvePlayerIdentity,
} from '../src/client/pokerProfile.ts';
import { createPokerHost } from '../src/host.ts';
import { ensureHumanActorInDatabase, ensureTableConversation } from '../src/session/pokerSession.ts';

test('Player Profile: derivePlayerId formats slugs deterministically', () => {
  assert.equal(derivePlayerId('Alice'), 'user_alice');
  assert.equal(derivePlayerId('Bob The Shark!'), 'user_bob_the_shark');
  assert.equal(derivePlayerId(''), 'user_hero');
  assert.equal(derivePlayerId('  Charlie_99  '), 'user_charlie_99');
});

test('Player Profile: save, load, and clear profile from custom local path', () => {
  const tmpDir = path.join(os.tmpdir(), `curator_poker_test_${Date.now()}`);
  const tmpProfilePath = path.join(tmpDir, 'test_profile.json');

  try {
    // 1. Initial state: not found
    const initial = loadPlayerProfile(tmpProfilePath);
    assert.equal(initial, null, 'Should return null when profile does not exist');

    // 2. Save profile
    const saved = savePlayerProfile({ playerName: 'Maverick' }, tmpProfilePath);
    assert.equal(saved.playerName, 'Maverick');
    assert.equal(saved.playerId, 'user_maverick');
    assert.ok(fs.existsSync(tmpProfilePath), 'Profile file should exist on disk');

    // 3. Load saved profile
    const loaded = loadPlayerProfile(tmpProfilePath);
    assert.ok(loaded);
    assert.equal(loaded?.playerName, 'Maverick');
    assert.equal(loaded?.playerId, 'user_maverick');

    // 4. Clear profile
    clearPlayerProfile(tmpProfilePath);
    assert.equal(fs.existsSync(tmpProfilePath), false, 'Profile file should be deleted');
    assert.equal(loadPlayerProfile(tmpProfilePath), null);
  } finally {
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
});

test('Player Profile: resolvePlayerIdentity uses stored profile without asking name', async () => {
  const tmpDir = path.join(os.tmpdir(), `curator_poker_resolve_${Date.now()}`);
  const tmpProfilePath = path.join(tmpDir, 'test_profile.json');

  try {
    // Seed an existing profile
    savePlayerProfile({ playerName: 'Vesper' }, tmpProfilePath);

    // Resolve identity with no explicit name provided
    const identity = await resolvePlayerIdentity({
      customProfilePath: tmpProfilePath,
      quiet: true,
    });

    assert.equal(identity.playerName, 'Vesper');
    assert.equal(identity.playerId, 'user_vesper');
  } finally {
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
});

test('Player Profile: resolvePlayerIdentity with explicit name overrides and saves', async () => {
  const tmpDir = path.join(os.tmpdir(), `curator_poker_override_${Date.now()}`);
  const tmpProfilePath = path.join(tmpDir, 'test_profile.json');

  try {
    const identity = await resolvePlayerIdentity({
      playerName: 'HighRoller',
      customProfilePath: tmpProfilePath,
      quiet: true,
    });

    assert.equal(identity.playerName, 'HighRoller');
    assert.equal(identity.playerId, 'user_highroller');

    const loaded = loadPlayerProfile(tmpProfilePath);
    assert.equal(loaded?.playerName, 'HighRoller');
  } finally {
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
});

test('User Identity in Database: ensureHumanActorInDatabase creates User record and updates participants', async () => {
  const tmpDbPath = path.join(os.tmpdir(), `poker_user_test_${Date.now()}.db`);
  const host = await createPokerHost({
    databasePath: tmpDbPath,
    quiet: true,
    forceReset: true,
  });

  try {
    const conversation = await ensureTableConversation(host, { tableId: 'test_table_1' });
    const user = await ensureHumanActorInDatabase(host, conversation.id, {
      playerName: 'DanielNegreanu',
    });

    assert.ok(user, 'User record must be returned');
    assert.equal(user.name, 'DanielNegreanu');
    assert.equal(user.id, 'user_danielnegreanu');

    // Query User table directly via Prisma
    const dbUser = await host.prisma.user.findUnique({
      where: { id: 'user_danielnegreanu' },
    });
    assert.ok(dbUser, 'User must exist in users table');
    assert.equal(dbUser?.name, 'DanielNegreanu');
    assert.equal(dbUser?.email, 'danielnegreanu@local.curator');

    // Verify conversation participant metadata
    const updatedConv = await host.prisma.conversation.findUnique({
      where: { id: conversation.id },
    });
    const participants = (updatedConv?.metadata as any)?.participants || [];
    const found = participants.find((p: any) => p.name === 'DanielNegreanu');
    assert.ok(found, 'Participant must be registered with player name in conversation metadata');
    assert.equal(found.isHuman, true);
    assert.equal(found.kind, 'user');
  } finally {
    await host.stop();
    if (fs.existsSync(tmpDbPath)) {
      try {
        fs.unlinkSync(tmpDbPath);
      } catch (_) {}
    }
  }
});
