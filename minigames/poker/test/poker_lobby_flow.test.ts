import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {
  PokerConversationType,
} from '../src/models/pokerContracts.ts';
import {
  PokerLobbyAction,
  getLobbyChoices,
  type PokerLobbyChoice,
  type PokerTableChoice,
} from '../src/workflows/pokerLobby.ts';
import { formatTableChoices } from '../src/services/pokerTableStore.ts';
import { POKER_SHAPE_URIS } from '../src/models/pokerShapes.ts';
import { createPokerHost } from '../src/host.ts';
import {
  createPokerGameSession,
  ensureTableConversation,
  ensureLobbyConversation,
  createLobbyConversation,
  closePokerLobbyConversation,
  createPokerGameTable,
  closePokerGameTable,
  enqueueTableASTRequest,
  ensureHumanActorInDatabase,
} from '../src/session/pokerSession.ts';

test('Lobby Models: getLobbyChoices returns typesafe PokerLobbyChoice array without any', () => {
  // 1. Without unfinished games: Only New Game and Exit
  const freshChoices: PokerLobbyChoice[] = getLobbyChoices(false);
  assert.equal(freshChoices.length, 2, 'Fresh lobby should have exactly 2 choices');
  assert.equal(freshChoices[0].id, PokerLobbyAction.NEW);
  assert.equal(freshChoices[1].id, PokerLobbyAction.EXIT);
  assert.ok(!freshChoices.some((c) => c.id === PokerLobbyAction.RESUME), 'Resume choice must not be present');

  // 2. With unfinished games: New Game, Resume Game, and Exit
  const resumeChoices: PokerLobbyChoice[] = getLobbyChoices(true, 3);
  assert.equal(resumeChoices.length, 3, 'Lobby with games should have 3 choices');
  assert.equal(resumeChoices[0].id, PokerLobbyAction.NEW);
  assert.equal(resumeChoices[1].id, PokerLobbyAction.RESUME);
  assert.equal(resumeChoices[2].id, PokerLobbyAction.EXIT);
  assert.ok(resumeChoices[1].label.includes('3 available'), 'Label should show table count');

  // 3. Choices carry only id/label/description/aliases (no per-choice event/payload/value)
  assert.deepEqual(Object.keys(freshChoices[0]).sort(), ['aliases', 'description', 'id', 'label']);
});

test('Table Selection: formatTableChoices returns typesafe PokerTableChoice array with Back action', () => {
  const tables = [
    { id: '10', tableId: '10', title: 'High Roller #10' },
    { id: '20', tableId: '20', title: 'High Roller #20' },
  ];

  const choices: PokerTableChoice[] = formatTableChoices(tables);
  assert.equal(choices.length, 3, 'Should format 2 tables + 1 Back option');

  assert.equal(choices[0].id, '10');
  assert.equal(choices[0].title, 'High Roller #10');

  assert.equal(choices[1].id, '20');

  // Back choice
  const backChoice = choices[2];
  assert.equal(backChoice.id, PokerLobbyAction.BACK);
  assert.ok(backChoice.aliases.includes('back'));
  assert.ok(backChoice.aliases.includes('3'));
});

test('Lobby AST Workflow: Stepping back from table selection returns to Lobby Options', async () => {
  const dbPath = path.join(os.tmpdir(), `poker_lobby_test_${Date.now()}.db`);
  const host = await createPokerHost({
    databasePath: dbPath,
    forceReset: true,
    quiet: true,
  });

  try {
    const session = await createPokerGameSession(host, { quiet: true });
    assert.ok(session);

    const convId = session.conversation.id;

    // Initial step should advance to the first choice: "Lobby Options:"
    const step1 = await session.step(convId, 100);
    assert.equal(step1.waitingForHuman, true, 'Should pause at interactive choice');

    const waitingReq1 = await host.prisma.request.findFirst({
      where: {
        conversationId: convId,
        status: 'WAITING_FOR_USER',
      },
      orderBy: { id: 'desc' },
    });
    assert.ok(waitingReq1);
    assert.equal(waitingReq1?.context?.choicePrompt, 'Lobby Options:');

    // For a fresh session, lobbyChoices has 2 choices (New Game, Exit)
    const activeChoices = waitingReq1?.context?.activeChoices;
    assert.equal(activeChoices.length, 2);

    // 2. Now simulate having an unfinished game for the user on a separate table conversation
    await ensureHumanActorInDatabase(host, 1, {
      playerName: 'Hero',
      playerId: 'user_hero',
    });
    const unfinishedConv = await host.prisma.conversation.create({
      data: {
        userId: 'user_hero',
        projectId: host.project.id,
        metadata: {
          tableName: 'Table #42',
          participants: [{ id: 'user_hero', name: 'Hero', isHuman: true }],
        },
      },
    });
    await host.prisma.conversation.update({
      where: { id: unfinishedConv.id },
      data: {
        metadata: {
          tableName: 'Table #42',
          participants: ['user_hero', 'bot_1'],
        },
      },
    });

    // Enqueue a non-terminal request with active players
    await host.prisma.request.create({
      data: {
        conversationId: unfinishedConv.id,
        projectId: host.project.id,
        userId: 'user_hero',
        status: 'WAITING_FOR_USER',
        context: {
          gameState: {
            tableId: String(unfinishedConv.id),
            gameOver: false,
            players: [
              { id: 'user_hero', name: 'Hero', isHuman: true },
              { id: 'bot_1', name: 'Bot 1', isHuman: false },
            ],
          },
        },
      },
    });

    // 3. Start a new lobby session with user identity
    const sessionWithGames = await createPokerGameSession(host, {
      quiet: true,
      playerName: 'Hero',
    });
    const convId2 = sessionWithGames.conversation.id;

    await sessionWithGames.step(convId2, 100);

    const waitingReq2 = await host.prisma.request.findFirst({
      where: {
        conversationId: convId2,
        status: 'WAITING_FOR_USER',
      },
      orderBy: { id: 'desc' },
    });
    assert.ok(waitingReq2);
    assert.equal(waitingReq2?.context?.choicePrompt, 'Lobby Options:');
    assert.equal(waitingReq2?.context?.activeChoices?.length, 3, 'Should present Resume Game when user has active table');

    // 4. Select Resume Game
    await sessionWithGames.send('poker:lobby_choice', { id: 'resume' }, convId2);
    await sessionWithGames.step(convId2, 100);

    const tableReq = await host.prisma.request.findFirst({
      where: {
        conversationId: convId2,
        status: 'WAITING_FOR_USER',
      },
      orderBy: { id: 'desc' },
    });
    assert.ok(tableReq);
    assert.equal(tableReq?.context?.choicePrompt, 'Select Table:');
    assert.ok(tableReq?.context?.activeChoices?.some((c: any) => c.id === 'back'), 'Should have back option');

    // 5. Select Back to Lounge Options
    await sessionWithGames.send('poker:table_selected', { id: 'back' }, convId2);
    await sessionWithGames.step(convId2, 100);

    const backToLobbyReq = await host.prisma.request.findFirst({
      where: {
        conversationId: convId2,
        status: 'WAITING_FOR_USER',
      },
      orderBy: { id: 'desc' },
    });
    assert.ok(backToLobbyReq);
    assert.equal(backToLobbyReq?.context?.choicePrompt, 'Lobby Options:', 'Should return to Lobby Options prompt');
    assert.equal(backToLobbyReq?.context?.activeChoices?.length, 3, 'Lobby options should be presented again');
  } finally {
    await host.stop();
  }
});

test('Lobby Separation & Lifecycle: Dedicated lobby conversation, table creation and closing', async () => {
  const dbPath = path.join(os.tmpdir(), `poker_lifecycle_test_${Date.now()}.db`);
  const host = await createPokerHost({
    databasePath: dbPath,
    forceReset: true,
    quiet: true,
  });

  try {
    // 1. Ensure lobby conversation is distinct and marked with isLobby: true
    const lobbyConv = await ensureLobbyConversation(host);
    assert.ok(lobbyConv);
    assert.equal(lobbyConv.metadata?.isLobby, true, 'Lobby must be marked with isLobby: true');
    assert.equal(lobbyConv.metadata?.type, PokerConversationType.LOBBY);

    // 2. Boot a default game session (attaches to Lobby)
    const session = await createPokerGameSession(host, { quiet: true });
    assert.equal(session.conversation.id, lobbyConv.id, 'Default session attaches to lobby conversation');

    // 3. Create a new table via createPokerGameTable
    const tableInfo = await createPokerGameTable(host, {
      title: 'Diamond Suite #7',
      startingChips: 1500,
      maxSeats: 4,
    });
    assert.ok(tableInfo);
    assert.notEqual(Number(tableInfo.tableId), lobbyConv.id, 'Game table is a separate conversation');

    const tableConv = await host.prisma.conversation.findUnique({
      where: { id: tableInfo.conversationId },
    });
    assert.equal(tableConv?.metadata?.type, PokerConversationType.TABLE);
    assert.equal(tableConv?.metadata?.isLobby, false);
    assert.equal(tableConv?.metadata?.tableName, 'Diamond Suite #7');

    // 4. Verify PokerTableShape semantic resource & player relation were created
    const tableResource = await host.prisma.resource.findUnique({
      where: { uri: `poker:table:${tableInfo.tableId}` },
      include: {
        subjectRelations: {
          include: { predicate: true, object: true },
        },
      },
    });
    assert.ok(tableResource, 'Semantic resource for PokerTableShape must exist');
    assert.equal(tableResource.metadata?.shape, POKER_SHAPE_URIS.TABLE_SHAPE);
    assert.equal(tableResource.metadata?.tableName, 'Diamond Suite #7');
    assert.equal(tableResource.metadata?.status, 'active');

    const playerRelation = tableResource.subjectRelations.find(
      (rel: any) => rel.predicate.uri === POKER_SHAPE_URIS.PLAYER_PREDICATE
    );
    assert.ok(playerRelation, 'Table resource must be linked via poker:hasPlayer relation');
    assert.ok(playerRelation.object.uri.startsWith('poker:player:'), 'Player object must have poker:player URI');

    // 5. Verify listTables returns the game table via single indexed semantic resource query
    const tables = await session.listTables();
    assert.equal(tables.length, 1, 'Only game tables are returned');
    assert.equal(tables[0].tableId, tableInfo.tableId);
    assert.ok(!tables.some((t) => t.tableId === String(lobbyConv.id)), 'Lobby conversation must NOT be in tables list');

    // 6. Close the game table
    await closePokerGameTable(host, tableInfo.tableId, 'user_exit');
    const closedConv = await host.prisma.conversation.findUnique({
      where: { id: tableInfo.conversationId },
    });
    assert.equal(closedConv?.metadata?.isClosed, true, 'Table conversation marked as closed');
    assert.equal(closedConv?.metadata?.closingReason, 'user_exit');

    // Semantic resource is updated to closed
    const closedResource = await host.prisma.resource.findUnique({
      where: { uri: `poker:table:${tableInfo.tableId}` },
    });
    assert.equal(closedResource?.metadata?.status, 'closed', 'Resource status must be closed');
    assert.equal(closedResource?.metadata?.isClosed, true);

    // After closing, listTables returns empty
    const tablesAfterClose = await session.listTables();
    assert.equal(tablesAfterClose.length, 0, 'Closed table is no longer returned in active tables');

    // Active requests on closed table are completed
    const activeReqs = await host.prisma.request.findMany({
      where: {
        conversationId: tableInfo.conversationId,
        status: { in: ['NEW', 'WAITING', 'WAITING_FOR_USER'] },
      },
    });
    assert.equal(activeReqs.length, 0, 'No active/waiting requests remain on closed table');
  } finally {
    await host.stop();
  }
});

test('Multi-Client Isolation: Multiple simultaneous clients have isolated lobby conversations and requests', async () => {
  const dbPath = path.join(os.tmpdir(), `poker_multiclient_test_${Date.now()}.db`);
  const host = await createPokerHost({
    databasePath: dbPath,
    forceReset: true,
    quiet: true,
  });

  try {
    // 1. Client A connects as Alice
    const sessionA = await createPokerGameSession(host, {
      quiet: true,
      playerName: 'Alice',
      playerId: 'user_alice',
      newSession: true,
    });

    // 2. Client B connects as Bob simultaneously
    const sessionB = await createPokerGameSession(host, {
      quiet: true,
      playerName: 'Bob',
      playerId: 'user_bob',
      newSession: true,
    });

    // 3. Verify conversations are completely isolated
    assert.notEqual(
      sessionA.conversation.id,
      sessionB.conversation.id,
      'Each client run must have a distinct lobby concierge conversation'
    );

    // 4. Step both clients to their interactive Lobby Options prompts
    await sessionA.step(sessionA.conversation.id, 100);
    await sessionB.step(sessionB.conversation.id, 100);

    const reqA = await host.prisma.request.findFirst({
      where: { conversationId: sessionA.conversation.id, status: 'WAITING_FOR_USER' },
    });
    const reqB = await host.prisma.request.findFirst({
      where: { conversationId: sessionB.conversation.id, status: 'WAITING_FOR_USER' },
    });

    assert.ok(reqA, "Alice's lobby request must be waiting for user");
    assert.ok(reqB, "Bob's lobby request must be waiting for user");
    assert.notEqual(reqA.id, reqB.id, 'Requests must be isolated');

    // 5. Alice selects Exit; Bob remains in the lobby
    await sessionA.send('poker:lobby_choice', { id: 'exit' }, sessionA.conversation.id);
    await sessionA.step(sessionA.conversation.id, 100);

    // Verify Alice's lobby conversation is closed
    const convA = await host.prisma.conversation.findUnique({
      where: { id: sessionA.conversation.id },
    });
    assert.equal(convA?.metadata?.isClosed, true, "Alice's lobby must be closed on exit");

    // Verify Bob's lobby conversation is still active and unaffected!
    const convB = await host.prisma.conversation.findUnique({
      where: { id: sessionB.conversation.id },
    });
    assert.equal(convB?.metadata?.isClosed, false, "Bob's lobby must remain active and unaffected");

    const reqBAfterAliceExit = await host.prisma.request.findFirst({
      where: { conversationId: sessionB.conversation.id, status: 'WAITING_FOR_USER' },
    });
    assert.ok(reqBAfterAliceExit, "Bob's request must still be waiting for user input");
  } finally {
    await host.stop();
  }
});

