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
        speech: 'I call.',
        speechAct: 'TABLE_TALK',
        innerMonologue: 'Concurrent table test.',
      }),
    };
  }
}

const mockLlm = new MockPokerLlmProvider();
LlmFactory.registerProvider('gemini', mockLlm);
curatorEngine.registerLlmProvider('gemini', mockLlm);

test('Multiple Concurrent Tables: Server hosts 2 tables simultaneously with isolated state, events, and turns', async () => {
  const tempDir = process.env.TEMP || os.tmpdir();
  const templateDb = path.join(tempDir, 'curator-poker.db');
  const testDb = path.join(tempDir, `curator_test_multitable_${Date.now()}.db`);
  if (fs.existsSync(templateDb)) {
    fs.copyFileSync(templateDb, testDb);
  }

  const serverInstance = await createPokerServer({
    port: 4896,
    databasePath: testDb,
    forceReset: !fs.existsSync(testDb),
    maxSeats: 4,
    pollInterval: 80,
  });

  const baseUrl = serverInstance.url;

  try {
    // 1. Initial table listing via REST: Table #1 exists
    const res1 = await fetch(`${baseUrl}/api/tables`);
    const data1 = (await res1.json()) as any;
    assert.equal(data1.success, true);
    assert.equal(data1.count, 1);
    const table1Id = data1.tables[0].tableId;

    // 2. Create Table #2 via REST
    const resCreate = await fetch(`${baseUrl}/api/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Table #2 - High Stakes Room',
        maxSeats: 4,
        startingChips: 5000,
        smallBlind: 50,
        bigBlind: 100,
      }),
    });
    const createData = (await resCreate.json()) as any;
    assert.equal(createData.success, true);
    assert(createData.table);
    const table2Id = createData.table.tableId;
    assert.notEqual(table1Id, table2Id);

    // 3. Verify /api/tables lists both concurrent tables
    const res2 = await fetch(`${baseUrl}/api/tables`);
    const data2 = (await res2.json()) as any;
    assert.equal(data2.success, true);
    assert.equal(data2.count, 2);

    // 4. Connect 2 WebSocket clients with table-specific filters
    const ws1Events: any[] = [];
    const ws2Events: any[] = [];

    const ws1 = new WebSocket(`${serverInstance.wsUrl}?table=${table1Id}`);
    const ws2 = new WebSocket(`${serverInstance.wsUrl}?table=${table2Id}`);

    ws1.on('message', (raw) => {
      try {
        ws1Events.push(JSON.parse(raw.toString()));
      } catch (_) {}
    });

    ws2.on('message', (raw) => {
      try {
        ws2Events.push(JSON.parse(raw.toString()));
      } catch (_) {}
    });

    await Promise.all([
      new Promise((resolve) => ws1.on('open', resolve)),
      new Promise((resolve) => ws2.on('open', resolve)),
    ]);

    // Wait until Table 1 reaches a human turn
    for (let i = 0; i < 50; i++) {
      const waitCheck = await fetch(`${baseUrl}/api/tables/${table1Id}/waiting`);
      const waitData = (await waitCheck.json()) as any;
      if (waitData.waiting) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    // 5. Submit an action specifically to Table 1
    const resAction1 = await fetch(`${baseUrl}/api/tables/${table1Id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: { type: 'CALL', amount: 20 } }),
    });
    const actionData1 = (await resAction1.json()) as any;
    assert.equal(actionData1.success, true);
    assert.equal(actionData1.tableId, table1Id);
    assert.equal(actionData1.woken, true);

    // Wait 250ms for event dispatch
    await new Promise((r) => setTimeout(r, 250));

    // 6. Verify Table 1 received event, but Table 2 client did NOT receive Table 1's action
    const t1ActionEvents = ws1Events.filter(
      (e) => e.type === 'poker:human_action' && String(e.payload?.tableId) === String(table1Id)
    );
    const t2ReceivedT1Actions = ws2Events.filter(
      (e) => e.type === 'poker:human_action' && String(e.payload?.tableId) === String(table1Id)
    );

    assert(t1ActionEvents.length > 0, 'Table 1 client must receive Table 1 action event');
    assert.equal(t2ReceivedT1Actions.length, 0, 'Table 2 client must NOT receive Table 1 events (isolated stream)');

    // 7. Verify both tables can be inspected independently via GET /api/tables/:id
    const resGet1 = await fetch(`${baseUrl}/api/tables/${table1Id}`);
    const get1 = (await resGet1.json()) as any;
    assert.equal(get1.success, true);
    assert.equal(get1.table.tableId, table1Id);

    const resGet2 = await fetch(`${baseUrl}/api/tables/${table2Id}`);
    const get2 = (await resGet2.json()) as any;
    assert.equal(get2.success, true);
    assert.equal(get2.table.tableId, table2Id);
    assert.equal(get2.table.title, 'Table #2 - High Stakes Room');

    // Clean up WebSockets
    ws1.close();
    ws2.close();
  } finally {
    await serverInstance.stop();
  }
});
