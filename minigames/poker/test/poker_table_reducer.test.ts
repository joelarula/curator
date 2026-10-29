import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceTable, PokerTableCommand, type PokerTableStep } from '../src/engine/pokerTable.ts';
import { PokerEvent } from '../src/models/pokerContracts.ts';
import type { PlayerAction } from '../src/types.ts';

const boot = (config: any = {}) => reduceTable(undefined, { type: PokerTableCommand.BOOT, config });
const start = (s: PokerTableStep) => reduceTable(s.gameState, { type: PokerTableCommand.START });
const act = (s: PokerTableStep, action: PlayerAction) => reduceTable(s.gameState, { type: PokerTableCommand.ACT, action });
const chipsInPlay = (s: PokerTableStep) => s.gameState.players.reduce((sum, p) => sum + p.chips, 0) + s.gameState.pot;
const names = (s: PokerTableStep) => s.events.map((e) => e.name);
const payload = (s: PokerTableStep, name: string): any => s.events.find((e) => e.name === name)?.payload;

const headsUp = (chips: number[], extra: any = {}) => boot({
  players: chips.map((c, i) => ({ id: `p${i}`, name: `P${i}`, chips: c })),
  ...extra,
});

/** Calls (or checks) for whoever is to act until the current hand is over. */
function callDown(s: PokerTableStep): PokerTableStep {
  const hand = s.gameState.handNumber;
  for (let i = 0; i < 50 && s.turn && s.gameState.handNumber === hand; i++) {
    s = act(s, { type: s.turn.toCall > 0 ? 'CALL' : 'CHECK' });
  }
  return s;
}

test('boot seats the table without starting a hand', () => {
  const s = boot({ tableId: 't1' });
  assert.equal(s.gameState.tableId, 't1');
  assert.equal(s.gameState.players.length, 4);
  assert.equal(s.gameState.handNumber, 0);
  assert.equal(s.turn, null);
  assert.deepEqual(s.events, []);
});

test('join and leave seat and unseat players', () => {
  let s = headsUp([1000]);
  s = reduceTable(s.gameState, { type: PokerTableCommand.JOIN, player: { id: 'late', name: 'Late', chips: 500 } });
  assert.deepEqual(s.gameState.players.map((p) => p.id), ['p0', 'late']);
  s = reduceTable(s.gameState, { type: PokerTableCommand.LEAVE, id: 'late' });
  assert.deepEqual(s.gameState.players.map((p) => p.id), ['p0']);
});

test('start deals a hand and hands the turn to a seat with its legal choices; it is idempotent', () => {
  const s = start(boot());
  assert.equal(s.gameState.handNumber, 1);
  assert.deepEqual(names(s), [PokerEvent.NEW_ROUND, PokerEvent.PHASE_DEAL]);
  assert.equal(payload(s, PokerEvent.NEW_ROUND).handNumber, 1);
  assert.ok(s.turn, 'a seat has to decide');
  assert.equal(s.turn!.seatId, s.gameState.players[s.gameState.activePlayerIdx].id);
  assert.ok(s.turn!.choices.some((c) => c.action.type === 'CALL'));

  const again = start(s);
  assert.equal(again.gameState.handNumber, 1, 'a running hand is not restarted');
  assert.deepEqual(again.events, []);
});

test('acting advances streets, settles and starts the next hand on its own', () => {
  let s = start(boot());
  const total = chipsInPlay(s);
  const first = act(s, { type: 'CALL' });
  assert.equal(names(first)[0], PokerEvent.ACTION_TAKEN);
  assert.equal(payload(first, PokerEvent.ACTION_TAKEN).action.type, 'CALL');
  assert.match(payload(first, PokerEvent.ACTION_TAKEN).summary, /calls/);

  s = callDown(s);
  assert.equal(s.gameState.handNumber, 2, 'the next hand started');
  assert.deepEqual(names(s).slice(-4), [PokerEvent.PHASE_STREET, PokerEvent.PHASE_SETTLE, PokerEvent.NEW_ROUND, PokerEvent.PHASE_DEAL],
    'the last action reached showdown, settled, and dealt the next hand');
  assert.ok(payload(s, PokerEvent.PHASE_SETTLE).winnerSummary);
  assert.equal(payload(s, PokerEvent.PHASE_SETTLE).gameState.board.length, 5, 'the settle event carries its own snapshot');
  assert.equal(payload(s, PokerEvent.NEW_ROUND).handNumber, 2);
  assert.equal(s.gameState.buttonIdx, 1, 'the button rotated');
  assert.equal(chipsInPlay(s), total, 'chips are conserved');
  assert.ok(s.turn);
});

test('everyone folding settles the hand without dealing further streets', () => {
  let s = start(boot());
  for (let i = 0; i < 3; i++) s = act(s, { type: 'FOLD' });
  assert.equal(s.gameState.handNumber, 2);
  assert.match(payload(s, PokerEvent.PHASE_SETTLE).winnerSummary, /everyone else folded/);
  assert.ok(!names(s).includes(PokerEvent.PHASE_STREET));
});

test('an all-in that is called runs the board out inside one reduction', () => {
  let s = start(headsUp([1000, 1000]));
  s = act(s, { type: 'ALL_IN' });
  s = act(s, { type: 'CALL' });
  const streets = s.events.filter((e) => e.name === PokerEvent.PHASE_STREET).map((e: any) => e.payload.street);
  assert.deepEqual(streets, ['FLOP', 'TURN', 'RIVER', 'SHOWDOWN']);
  assert.ok(names(s).includes(PokerEvent.PHASE_SETTLE));
  assert.equal(chipsInPlay(s), 2000);
});

test('the game ends after maxHands with final standings and no turn', () => {
  let s = start(boot({ maxHands: 1 }));
  s = callDown(s);
  assert.equal(s.gameState.gameOver, true);
  assert.equal(s.turn, null);
  assert.equal(s.gameState.finalStandings?.length, 4);
  assert.ok(!names(s).includes(PokerEvent.NEW_ROUND), 'no hand starts after the last one');

  assert.deepEqual(act(s, { type: 'CHECK' }).events, [], 'a finished game ignores actions');
  assert.equal(start(s).gameState.handNumber, 1, 'and does not start another hand');
});
