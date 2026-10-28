import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { createPokerHost } from '../src/host.ts';
import {
  getOrCreateBankroll,
  depositBuyIn,
  cashOutToBankroll,
  reloadBankroll,
  getBuyInPresets,
  parseChipAmount,
} from '../src/services/pokerBankrollStore.ts';
import {
  createPokerGameSession,
  createPokerGameTable,
  closePokerGameTable,
} from '../src/session/pokerSession.ts';
import { POKER_SHAPE_URIS } from '../src/models/pokerShapes.ts';

test('Cashier Bankroll Service: Manages player balance, presets, and deposits', async () => {
  const dbPath = path.join(os.tmpdir(), `poker_bankroll_test_${Date.now()}.db`);
  const host = await createPokerHost({
    databasePath: dbPath,
    forceReset: true,
    quiet: true,
  });

  try {
    const prisma = host.prisma;
    const userId = 'player_hero';

    // 1. Initial Bankroll Creation ($10,000 default)
    const bankroll = await getOrCreateBankroll(prisma, userId);
    assert.equal(bankroll.balance, 10000);
    assert.equal(bankroll.uri, `${POKER_SHAPE_URIS.BANKROLL_CLASS}:${userId}`);

    // Verify stored as semantic resource in database
    const resource = await prisma.resource.findUnique({
      where: { uri: bankroll.uri },
    });
    assert.ok(resource, 'Bankroll resource must exist in DB');
    const parsed = JSON.parse(resource.description);
    assert.equal(parsed.balance, 10000);

    // 2. Buy-in Presets Calculation (Big blind: $20)
    const presets = getBuyInPresets(bankroll.balance, 20);
    assert.equal(presets.minBuyIn, 400); // 20 BB
    assert.equal(presets.maxBuyIn, 2000); // 100 BB
    assert.equal(presets.canAfford, true);
    assert.equal(presets.choices.length, 3);
    assert.equal(presets.choices[0].amount, 500); // Short Stack (25 BB)
    assert.equal(presets.choices[1].amount, 1000); // Standard Stack (50 BB)
    assert.equal(presets.choices[2].amount, 2000); // Deep Stack (100 BB)

    // 3. Deposit Buy-In ($1,000)
    const depositRes = await depositBuyIn(prisma, userId, 1000, 'table_1');
    assert.equal(depositRes.success, true);
    assert.equal(depositRes.newBalance, 9000);
    assert.equal(depositRes.deposited, 1000);

    // Free-form deposit with string input '750'
    const freeFormRes = await depositBuyIn(prisma, userId, '750', 'table_2');
    assert.equal(freeFormRes.success, true);
    assert.equal(freeFormRes.deposited, 750);
    assert.equal(freeFormRes.newBalance, 8250);

    // Free-form deposit with dollar sign and commas '$1,200'
    const dollarRes = await depositBuyIn(prisma, userId, '$1,200', 'table_3');
    assert.equal(dollarRes.success, true);
    assert.equal(dollarRes.deposited, 1200);
    assert.equal(dollarRes.newBalance, 7050);

    // Verify balance updated in DB
    const updated = await getOrCreateBankroll(prisma, userId);
    assert.equal(updated.balance, 7050);

    // 4. Cash Out ($3,400 after a winning session)
    const cashOutRes = await cashOutToBankroll(prisma, userId, 3400, 'table_1');
    assert.equal(cashOutRes.success, true);
    assert.equal(cashOutRes.newBalance, 10450);
    assert.equal(cashOutRes.cashedOut, 3400);

    // 5. Reload Bankroll if low
    // Simulate losing funds down to $200
    await depositBuyIn(prisma, userId, 10250, 'table_1', null, { maxBuyIn: 10450 });
    const lowBankroll = await getOrCreateBankroll(prisma, userId);
    assert.equal(lowBankroll.balance, 200);

    const lowPresets = getBuyInPresets(lowBankroll.balance, 20);
    assert.equal(lowPresets.canAfford, false);

    // Top-up reload ($5,000)
    const reloaded = await reloadBankroll(prisma, userId, 5000);
    assert.equal(reloaded.balance, 5200);
    const reloadedPresets = getBuyInPresets(reloaded.balance, 20);
    assert.equal(reloadedPresets.canAfford, true);

    // 6. Free-form top-ups persist on the same wallet resource
    const freeForm = await reloadBankroll(prisma, userId, parseChipAmount('$7,500'));
    assert.equal(freeForm.added, 7500);
    assert.equal(freeForm.balance, 12700);
    const noop = await reloadBankroll(prisma, userId, parseChipAmount('lots'));
    assert.equal(noop.added, 0);
    assert.equal(noop.balance, 12700);
    assert.equal((await getOrCreateBankroll(prisma, userId)).balance, 12700);
  } finally {
    await host.stop();
  }
});

test('parseChipAmount: accepts free-form chip amounts', () => {
  assert.equal(parseChipAmount(5000), 5000);
  assert.equal(parseChipAmount('5000'), 5000);
  assert.equal(parseChipAmount('$5,000'), 5000);
  assert.equal(parseChipAmount('10k'), 10000);
  assert.equal(parseChipAmount('2.5K'), 2500);
  assert.equal(parseChipAmount({ value: 1000 }), 1000);
  assert.equal(parseChipAmount({ choice: '750' }), 750);
  assert.equal(parseChipAmount('-100'), 0);
  assert.equal(parseChipAmount('abc'), 0);
  assert.equal(parseChipAmount(undefined), 0);
});

test('Cashier Table Integration: Table creation with custom buyIn and automatic cash out', async () => {
  const dbPath = path.join(os.tmpdir(), `poker_cashier_table_test_${Date.now()}.db`);
  const host = await createPokerHost({
    databasePath: dbPath,
    forceReset: true,
    quiet: true,
  });

  try {
    const prisma = host.prisma;
    const userId = host.user.id;

    // 1. Create table with custom buyIn ($2,000 deep stack)
    const tableInfo = await createPokerGameTable(host, {
      title: 'High Roller Suite',
      startingChips: 2000,
      smallBlind: 10,
      bigBlind: 20,
      playerName: host.user.name || 'Hero',
    });

    assert.ok(tableInfo.tableId);
    const conv = await prisma.conversation.findUnique({
      where: { id: Number(tableInfo.tableId) },
    });
    const meta = typeof conv.metadata === 'string' ? JSON.parse(conv.metadata) : conv.metadata;
    assert.equal(meta.startingChips, 2000);

    // 2. Close table and verify cash out
    await closePokerGameTable(host, tableInfo.tableId, 'table_closed');

    const convClosed = await prisma.conversation.findUnique({
      where: { id: Number(tableInfo.tableId) },
    });
    const closedMeta = typeof convClosed.metadata === 'string' ? JSON.parse(convClosed.metadata) : convClosed.metadata;
    assert.equal(closedMeta.isClosed, true);
  } finally {
    await host.stop();
  }
});

test('Client Shell Status Command: Displays wallet and bankroll amount', async () => {
  const dbPath = path.join(os.tmpdir(), `poker_status_test_${Date.now()}.db`);
  const host = await createPokerHost({
    databasePath: dbPath,
    forceReset: true,
    quiet: true,
  });

  try {
    const session = await createPokerGameSession(host, {
      quiet: true,
      playerName: 'Hero',
    });

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(' '));

    const { createPokerClientShell } = await import('../src/client/pokerClientShell.ts');
    const shell = createPokerClientShell({
      actorName: 'Hero',
      getGameState: () => null,
      channel: {
        tableId: '1',
        send: async () => true,
        close: async () => {},
        runTool: (tool, args) => session.runTool(tool, args, 1),
      } as any,
    });

    await (shell as any).handleLine('status');
    console.log = origLog;

    const statusOutput = logs.join('\n');
    assert.ok(statusOutput.includes('"wallet": "$10,000"'), `Status output must include wallet: ${statusOutput}`);
    assert.ok(statusOutput.includes('"actor": "Hero"'), 'Status output must include actor');
  } finally {
    await host.stop();
  }
});

test('Buy-In Flow: Supports numeric preset selection and free-form deposit amount', async () => {
  const sentEvents: Array<{ event: string; payload: any }> = [];
  const { createPokerClientShell } = await import('../src/client/pokerClientShell.ts');
  const { getBuyInPresets } = await import('../src/services/pokerBankrollStore.ts');

  const presets = getBuyInPresets(10000, 20);

  const shell = createPokerClientShell({
    actorName: 'Hero',
    getGameState: () => null,
    channel: {
      tableId: '1',
      send: async (event: string, payload: any) => {
        sentEvents.push({ event, payload });
      },
      close: async () => {},
    } as any,
  });

  // 1. Preset numeric choice "1" (Short Stack - $500)
  shell.setChoices(presets.choices, { blocking: true });
  await (shell as any).handleLine('1');

  assert.strictEqual(sentEvents.length, 1);
  assert.strictEqual(sentEvents[0].event, 'poker:buy_in_choice');
  assert.strictEqual(sentEvents[0].payload.amount, 500);

  // 2. Free-form deposit amount "750"
  sentEvents.length = 0;
  shell.setChoices(presets.choices, { blocking: true });
  await (shell as any).handleLine('750');

  assert.strictEqual(sentEvents.length, 1);
  assert.strictEqual(sentEvents[0].event, 'poker:buy_in_choice');
  assert.strictEqual(sentEvents[0].payload.amount, 750);
});

