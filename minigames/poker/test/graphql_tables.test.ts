import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { curatorEngine, LlmFactory } from '@curator/agent-server';
import { createPokerServer } from '../src/server/pokerServer.ts';
import { WebSocket } from 'ws';

class MockPokerLlmProvider {
  readonly providerName = 'gemini';
  async generateContent(_req: any) {
    return {
      text: JSON.stringify({
        action: 'CALL',
        amount: 20,
        speech: 'GraphQL test call.',
        speechAct: 'TABLE_TALK',
        innerMonologue: 'Testing GraphQL layer.',
      }),
    };
  }
}

const mockLlm = new MockPokerLlmProvider();
LlmFactory.registerProvider('gemini', mockLlm);
curatorEngine.registerLlmProvider('gemini', mockLlm);

test('GraphQL over WebSocket & Session ID: Queries, Mutations, and Subscriptions', async () => {
  const tempDir = process.env.TEMP || os.tmpdir();
  const templateDb = path.join(tempDir, 'curator-poker.db');
  const testDb = path.join(tempDir, `curator_test_graphql_${Date.now()}.db`);
  if (fs.existsSync(templateDb)) {
    fs.copyFileSync(templateDb, testDb);
  }

  const serverInstance = await createPokerServer({
    port: 4897,
    databasePath: testDb,
    forceReset: !fs.existsSync(testDb),
    maxSeats: 4,
    pollInterval: 80,
  });

  const baseUrl = serverInstance.url;

  try {
    // 1. GET /graphql returns GraphQL SDL schema
    const sdlRes = await fetch(`${baseUrl}/graphql`);
    const sdlText = await sdlRes.text();
    assert.match(sdlText, /type PokerTableInfo/);
    assert.match(sdlText, /type Mutation/);
    assert.match(sdlText, /type Subscription/);

    // 2. POST /graphql Query: list tables
    const queryTablesRes = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetTables {
            tables {
              tableId
              conversationId
              title
              waitingForHuman
            }
          }
        `,
      }),
    });
    const queryTablesData = (await queryTablesRes.json()) as any;
    assert.ok(queryTablesData.data?.tables, 'Expected data.tables');
    assert.equal(queryTablesData.data.tables.length, 1);
    const table1Id = queryTablesData.data.tables[0].tableId;
    assert.ok(table1Id);

    // 3. POST /graphql Mutation: createTable
    const createTableRes = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation CreateNewTable($input: CreateTableInput) {
            createTable(input: $input) {
              tableId
              title
              waitingForHuman
            }
          }
        `,
        variables: {
          input: {
            title: 'GraphQL High Rollers',
            startingChips: 2500,
          },
        },
      }),
    });
    const createTableData = (await createTableRes.json()) as any;
    assert.ok(createTableData.data?.createTable, 'Expected data.createTable');
    assert.equal(createTableData.data.createTable.title, 'GraphQL High Rollers');
    const table2Id = createTableData.data.createTable.tableId;
    assert.notEqual(table2Id, table1Id);

    // 4. WebSocket Client with sessionId
    const testSessionId = 'sess_player_alice_99';
    const wsUrl = `${serverInstance.wsUrl}?sessionId=${testSessionId}&table=${table1Id}`;
    const ws = new WebSocket(wsUrl);

    const receivedWsEvents: any[] = [];
    const receivedGraphqlFrames: any[] = [];

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'next' || msg.type === 'result') {
          receivedGraphqlFrames.push(msg);
        } else {
          receivedWsEvents.push(msg);
        }
      } catch (_) {}
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // Verify initial welcome connected event has sessionId
    await new Promise((r) => setTimeout(r, 100));
    const connectedEvent = receivedWsEvents.find((e) => e.type === 'connected');
    assert.ok(connectedEvent, 'Expected connected event');
    assert.equal(connectedEvent.sessionId, testSessionId);
    assert.equal(connectedEvent.payload?.sessionId, testSessionId);

    // 5. Direct GraphQL Query over WebSocket
    ws.send(
      JSON.stringify({
        id: 'req-ws-query',
        type: 'query',
        query: `query { tables { tableId title } }`,
      })
    );

    await new Promise((r) => setTimeout(r, 150));
    const wsQueryResult = receivedGraphqlFrames.find((f) => f.id === 'req-ws-query');
    assert.ok(wsQueryResult, 'Expected response to WS query');
    assert.equal(wsQueryResult.type, 'result');
    assert.equal(wsQueryResult.data?.tables?.length, 2);

    // 6. GraphQL-over-WS Subscription
    ws.send(
      JSON.stringify({
        id: 'sub-table-events',
        type: 'subscribe',
        payload: {
          query: `
            subscription {
              tableEvents {
                type
                payload
                sessionId
                tableId
              }
            }
          `,
        },
      })
    );

    await new Promise((r) => setTimeout(r, 100));

    // 7. Trigger a speech mutation carrying sessionId
    const speechMutationRes = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation SendSpeech($tableId: ID, $text: String!, $sessionId: String) {
            submitSpeech(tableId: $tableId, text: $text, sessionId: $sessionId) {
              success
              tableId
              text
              sessionId
            }
          }
        `,
        variables: {
          tableId: table1Id,
          text: 'Good luck everyone!',
          sessionId: testSessionId,
        },
      }),
    });
    const speechData = (await speechMutationRes.json()) as any;
    assert.equal(speechData.data?.submitSpeech?.success, true);
    assert.equal(speechData.data?.submitSpeech?.sessionId, testSessionId);

    // Verify WebSocket subscription received the event and it carries sessionId
    await new Promise((r) => setTimeout(r, 200));

    // Check GraphQL subscription frame
    const subFrame = receivedGraphqlFrames.find(
      (f) => f.id === 'sub-table-events' && f.payload?.data?.tableEvents?.type === 'poker:speech_response'
    );
    assert.ok(subFrame, 'Expected subscription frame for poker:speech_response');
    assert.equal(subFrame.payload.data.tableEvents.sessionId, testSessionId);
    assert.equal(subFrame.payload.data.tableEvents.tableId, table1Id);

    // Check raw event stream envelope also carries sessionId
    const rawSpeechEvent = receivedWsEvents.find((e) => e.type === 'poker:speech_response');
    assert.ok(rawSpeechEvent, 'Expected raw poker:speech_response event');
    assert.equal(rawSpeechEvent.sessionId, testSessionId);
    assert.equal(rawSpeechEvent.tableId, table1Id);

    ws.close();
  } finally {
    await serverInstance.stop();
    if (fs.existsSync(testDb)) {
      try {
        fs.unlinkSync(testDb);
      } catch (_) {}
    }
  }
});
