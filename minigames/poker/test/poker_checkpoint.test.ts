import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPokerHost } from '../src/host.ts';
import { createPokerGameSession } from '../src/session/pokerSession.ts';

test('Poker with checkpoint durability: a table runs in memory, moves at the human turn, and plays on durably', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-checkpoint-'));
  const host = await createPokerHost({ databasePath: path.join(dir, 'poker.db'), forceReset: true, quiet: true, durability: 'checkpoint' });
  try {
    assert.ok(host.durablePrisma, 'checkpoint hosts have a durable database');
    const session = await createPokerGameSession(host, { maxSeats: 4, startingChips: 1000, quiet: true });
    const table = await session.createTable({ title: 'Checkpoint table' });
    const tableId = table.conversationId;

    // Created in memory, id reserved durably; the knowledge-graph resource is long-lived, so it is durable
    assert.equal(await host.prismaFor(tableId), host.prisma);
    assert.ok(await host.durablePrisma.conversation.findUnique({ where: { id: tableId } }));
    assert.ok(await host.durablePrisma.resource.findFirst({ where: { conversations: { some: { id: tableId } } } }));

    const first = await session.step(table.tableId, 200);
    assert.ok(first.waitingForHuman && first.humanTurn, 'the table reaches the human turn');
    assert.ok(first.gameState?.players?.length);

    // Suspended at the human turn: moved to the configured database, nothing left in memory
    assert.equal(await host.prismaFor(tableId), host.durablePrisma);
    assert.equal(await host.prisma.request.count({ where: { conversationId: tableId } }), 0);
    const parked = await host.durablePrisma.request.count({
      where: { conversationId: tableId, status: { in: ['WAITING_FOR_USER', 'WAITING_FOR_EVENT'] } },
    });
    assert.ok(parked > 0);
    assert.deepEqual((await session.getGameState(table.tableId))?.players?.length, first.gameState.players.length);

    // The action is routed to the durable processor, which continues the hand
    const before = await host.durablePrisma.request.count({ where: { conversationId: tableId } });
    const action = await session.submitAction({ type: first.humanTurn.toCall > 0 ? 'CALL' : 'CHECK' }, { tableId: table.tableId });
    assert.equal(action.woken, true);
    assert.ok((await host.durablePrisma.request.count({ where: { conversationId: tableId } })) > before);
    assert.ok(await session.getGameState(table.tableId));

    const tables = await session.listTables();
    assert.ok(tables.some((t) => t.conversationId === tableId), 'moved tables are still listed');
    await session.close();
  } finally {
    await host.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
