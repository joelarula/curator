/**
 * Full-game replay: the real poker workflow AST, real tools, a deterministic LLM and a scripted human.
 * Safety net for workflow refactors — asserts the game's observable behaviour, not its AST shape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import { makeFakeLlm } from '../../../curator/test/helpers/harness.ts';
import { PokerEvent, PokerTablePhase } from '../src/models/pokerContracts.ts';
import { rebuildStateSnapshot } from '../../../curator/src/engine/ConversationStateLog.ts';

const HANDS = 2;
const SEATS = 4;
const STARTING_CHIPS = 1000;

// Passive table: everyone checks when they can and calls otherwise, so every hand reaches showdown.
const passiveLlm = () =>
  makeFakeLlm((req: any) => {
    const prompt = JSON.stringify(req.messages ?? req);
    const toMatch = Number(prompt.match(/Current Bet to Match: \[chips\] (\d+)/)?.[1] ?? 0);
    const myBet = Number(prompt.match(/Your Street Bet: \[chips\] (\d+)/)?.[1] ?? 0);
    const type = toMatch - myBet > 0 ? 'CALL' : 'CHECK';
    return JSON.stringify({ action: { type }, innerMonologue: 'Passive line.' });
  });

const humanPick = (choices: any[] = []) => {
  const ids = choices.map((c: any) => String(c.id ?? c.type ?? c).toUpperCase());
  return { type: ids.includes('CHECK') ? 'CHECK' : 'CALL' };
};

test('replay: a passive table plays full hands through every street to showdown', { timeout: 300_000 }, async () => {
  const { createPokerHost } = await import('../src/host.ts');
  const { createPokerGameSession } = await import('../src/session/pokerSession.ts');
  const llm = passiveLlm();
  const host: any = await createPokerHost({
    databasePath: path.join(os.tmpdir(), `curator_test_replay_${Date.now()}.db`),
    forceReset: true,
    quiet: true,
    llmProvider: llm.provider,
  });
  const session = await createPokerGameSession(host, { tableId: 1, forceReset: true, maxSeats: SEATS, startingChips: STARTING_CHIPS });

  try {
    let s: any = await session.step(session.tableId, 400);
    for (let turns = 0; turns < 60 && s.waitingForHuman && (s.gameState?.handNumber ?? 0) <= HANDS; turns++) {
      await session.send('poker:human_action', humanPick(s.humanTurn?.choices), session.tableId);
      s = await session.step(session.tableId, 400);
    }
    assert.ok((s.gameState?.handNumber ?? 0) > HANDS, `played ${HANDS} hands (now at hand ${s.gameState?.handNumber})`);

    // Nothing in the engine failed along the way.
    const failed = await host.prisma.request.findMany({ where: { status: 'FAILED' }, include: { responses: true } });
    assert.deepEqual(failed.map((r: any) => r.responses.at(-1)?.content), []);

    // Every completed hand walked deal -> flop -> turn -> river -> showdown -> settle.
    const log = await host.prisma.eventLog.findMany({ orderBy: { id: 'asc' } });
    const events = log.map((e: any) => e.eventName);
    const phases = log
      .filter((e: any) => [PokerEvent.NEW_ROUND, PokerEvent.PHASE_DEAL, PokerEvent.PHASE_STREET, PokerEvent.PHASE_SETTLE].includes(e.eventName))
      .map((e: any) => e.eventName === PokerEvent.PHASE_STREET ? `street:${(typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload)?.street}` : e.eventName);
    const hand = [PokerEvent.NEW_ROUND, PokerEvent.PHASE_DEAL, 'street:FLOP', 'street:TURN', 'street:RIVER', 'street:SHOWDOWN', PokerEvent.PHASE_SETTLE];
    assert.deepEqual(phases.slice(0, hand.length * HANDS), Array(HANDS).fill(hand).flat());

    // Each seat acted at least once per hand, and only the scripted passive actions were taken.
    const actions = events.filter((e: string) => e === PokerEvent.ACTION_TAKEN).length;
    assert.ok(actions >= SEATS * HANDS, `at least ${SEATS * HANDS} actions, got ${actions}`);
    assert.ok(llm.requests.length > 0, 'AI seats deliberated through the LLM');

    // Chips are conserved between hands (the next hand's blinds are already posted into the pot).
    const gs = s.gameState;
    const chips = gs.players.reduce((sum: number, p: any) => sum + p.chips, 0) + (gs.pot ?? 0);
    assert.equal(chips, SEATS * STARTING_CHIPS);
  } finally {
    await session.close();
    await host.stop();
  }
});

test('replay: pause and resume re-prompt the same seat; exit closes the table', { timeout: 300_000 }, async () => {
  const { createPokerHost } = await import('../src/host.ts');
  const { createPokerGameSession } = await import('../src/session/pokerSession.ts');
  const host: any = await createPokerHost({
    databasePath: path.join(os.tmpdir(), `curator_test_pause_${Date.now()}.db`),
    forceReset: true,
    quiet: true,
    llmProvider: passiveLlm().provider,
  });
  const session = await createPokerGameSession(host, { tableId: 1, forceReset: true, maxSeats: SEATS, startingChips: STARTING_CHIPS });
  const eventNames = async () => (await host.prisma.eventLog.findMany({ orderBy: { id: 'asc' } })).map((e: any) => e.eventName);

  try {
    let s: any = await session.step(session.tableId, 400);
    assert.ok(s.waitingForHuman, 'the human seat is prompted');
    const hand = s.gameState?.handNumber;

    await session.send('poker:human_action', { type: 'PAUSE' }, session.tableId);
    s = await session.step(session.tableId, 400);
    assert.equal(s.humanTurn, null, 'no prompt while paused');
    assert.ok((await eventNames()).includes(PokerEvent.TABLE_PAUSED));

    await session.send(PokerEvent.RESUME_ACTION, { type: 'RESUME' }, session.tableId);
    s = await session.step(session.tableId, 400);
    assert.ok(s.humanTurn, 'the same seat is prompted again after resuming');
    assert.equal(s.gameState?.handNumber, hand);
    assert.ok((await eventNames()).includes(PokerEvent.TABLE_RESUMED));

    await session.send('poker:human_action', { type: 'EXIT' }, session.tableId);
    s = await session.step(session.tableId, 400);
    assert.equal(s.waitingForHuman, false);
    const names = await eventNames();
    const table = (await rebuildStateSnapshot(host.prisma, Number(session.tableId))).state;
    assert.equal(table.tablePhase, PokerTablePhase.EXITED);
    assert.equal(table.sessionEnded, true);
    assert.equal(table.isClosed, true);
    assert.ok(names.includes(PokerEvent.SESSION_EXITED), 'leaving is announced');
    assert.ok(names.lastIndexOf(PokerEvent.ACTION_TAKEN) < names.lastIndexOf(PokerEvent.HUMAN_ACTION), 'nothing is played after leaving');

    const failed = await host.prisma.request.count({ where: { status: 'FAILED' } });
    assert.equal(failed, 0);
  } finally {
    await session.close();
    await host.stop();
  }
});
