import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { createPokerHost } from '../src/host.ts';
import { appendStatePatch, rewindState } from '../src/curator.ts';
import {
  deriveTableStatus,
  pokerTableStatusUri,
  queryActivePokerTables,
  syncPokerTableResource,
} from '../src/services/pokerTableStore.ts';
import { POKER_SHAPE_URIS, POKER_TABLE_STATUS } from '../src/models/pokerShapes.ts';

test('deriveTableStatus: close > game over > crash > pause > active', () => {
  assert.equal(deriveTableStatus({}), POKER_TABLE_STATUS.ACTIVE);
  assert.equal(deriveTableStatus({ isPaused: true }), POKER_TABLE_STATUS.PAUSED);
  assert.equal(deriveTableStatus({ isPaused: true, lastFailure: { reason: 'x' } }), POKER_TABLE_STATUS.FAILED);
  assert.equal(deriveTableStatus({ lastFailure: { reason: 'x' }, gameOver: true }), POKER_TABLE_STATUS.FINISHED);
  assert.equal(deriveTableStatus({ gameOver: true, sessionEnded: true }), POKER_TABLE_STATUS.CLOSED);
  assert.equal(deriveTableStatus({ isClosed: true }), POKER_TABLE_STATUS.CLOSED);
});

test('pokerTableProjector: state events drive the table status and seat triples atomically', async () => {
  const dbPath = path.join(os.tmpdir(), `poker_projector_test_${Date.now()}.db`);
  const host = await createPokerHost({ databasePath: dbPath, forceReset: true, quiet: true });

  try {
    const prisma = host.prisma;
    const conv = await prisma.conversation.create({ data: { userId: 'user_hero', projectId: host.project.id } });
    await syncPokerTableResource(prisma, {
      tableId: conv.id,
      title: 'Projector Table',
      conversationId: conv.id,
      projectId: host.project.id,
      userId: 'user_hero',
      players: [{ id: 'user_hero', name: 'Hero', isHuman: true }],
    });

    const table = async () =>
      prisma.resource.findUnique({
        where: { uri: `poker:table:${conv.id}` },
        include: { subjectRelations: { where: { existent: true }, include: { predicate: true, object: true } } },
      });
    const objectsOf = async (predicateUri: string) =>
      (await table()).subjectRelations
        .filter((rel: any) => rel.predicate.uri === predicateUri)
        .map((rel: any) => rel.object.uri)
        .sort();
    const status = async () => (await objectsOf(POKER_SHAPE_URIS.STATUS_PREDICATE)).join();
    const listed = async () =>
      (await queryActivePokerTables(prisma, { projectId: host.project.id, userId: 'user_hero' })).tables.length;

    assert.equal(await status(), pokerTableStatusUri(POKER_TABLE_STATUS.ACTIVE));
    assert.equal(await listed(), 1);

    // Seats: joiners are linked, leavers retired, the creation-time link is never touched
    await appendStatePatch(prisma, conv.id, {
      set: { seatedPlayers: [{ id: 'bot_1', name: 'Bot 1' }, { id: 'bot_2', name: 'Bot 2' }] },
    });
    await appendStatePatch(prisma, conv.id, { set: { seatedPlayers: [{ id: 'bot_1', name: 'Bot 1' }] } });
    assert.deepEqual(await objectsOf(POKER_SHAPE_URIS.PLAYER_PREDICATE), ['poker:agent:bot_1', 'poker:player:user_hero']);

    // Pause stays resumable; finished is not
    const paused = await appendStatePatch(prisma, conv.id, { set: { isPaused: true } });
    assert.equal(await status(), pokerTableStatusUri(POKER_TABLE_STATUS.PAUSED));
    assert.equal(await listed(), 1, 'paused tables can be resumed');

    await appendStatePatch(prisma, conv.id, { set: { gameOver: true } });
    assert.equal(await status(), pokerTableStatusUri(POKER_TABLE_STATUS.FINISHED));
    assert.equal(await listed(), 0, 'finished tables are not resumable');

    // Rewinding the log rewinds the graph too
    await rewindState(prisma, conv.id, paused.seq);
    assert.equal(await status(), pokerTableStatusUri(POKER_TABLE_STATUS.PAUSED));

    // A crash recorded by the engine marks the table failed; its details stay in the event log
    await appendStatePatch(prisma, conv.id, {
      set: { lastFailure: { requestId: 1, nodeId: null, nodeType: 'Curator_Tool', reason: 'boom', failedAt: 'now' } },
    });
    assert.equal(await status(), pokerTableStatusUri(POKER_TABLE_STATUS.FAILED));
    assert.equal(await listed(), 0, 'failed tables are not offered for resume');

    const statusTriples = (await table()).subjectRelations.filter(
      (rel: any) => rel.predicate.uri === POKER_SHAPE_URIS.STATUS_PREDICATE
    );
    assert.equal(statusTriples.length, 1, 'exactly one live status triple');
  } finally {
    await host.stop();
  }
});
