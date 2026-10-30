import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createPokerHost } from '../src/host.ts';
import { ensureHumanActorInDatabase, ensureTableConversation } from '../src/session/pokerSession.ts';

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
