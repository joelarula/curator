/**
 * The table reducer: the single deterministic entry point workflows reach (`reduce('poker_table_command', ...)`).
 * `reduceTable(state, command)` applies one command and then advances the table on its own as far as
 * the rules allow: completed streets are dealt, finished hands settle, the button rotates and the next
 * hand starts, until a seat has to decide or the game is over.
 * Flows only handle what is not deterministic (seat decisions, waiting, menus, pause/exit); they emit the
 * returned `events` as they are (`emitEvents`).
 */
import type { PlayerAction, PokerGameState, Street } from '../types.ts';
import { PokerEvent, PokerStreet } from '../models/pokerContracts.ts';
import {
  initPokerLobby,
  joinPokerLobby,
  leavePokerLobby,
  startPokerHand,
  applyPokerAction,
  dealPokerStreet,
  distributePokerPots,
  rotatePokerDealer,
  checkPokerGameOver,
  getLegalChoices,
  getNextActivePlayerIdx,
  type PlayerChoice,
} from './pokerEngine.ts';

export const PokerTableCommand = {
  BOOT: 'boot',
  JOIN: 'join',
  LEAVE: 'leave',
  /** Starts a hand unless one is in progress or the game is over (idempotent). */
  START: 'start',
  ACT: 'act',
} as const;

export type PokerTableCommandType = (typeof PokerTableCommand)[keyof typeof PokerTableCommand];

export type PokerTableCommandInput =
  | { type: typeof PokerTableCommand.BOOT; config?: Parameters<typeof initPokerLobby>[0] }
  | { type: typeof PokerTableCommand.JOIN; player: any }
  | { type: typeof PokerTableCommand.LEAVE; id: string }
  | { type: typeof PokerTableCommand.START }
  | { type: typeof PokerTableCommand.ACT; action: PlayerAction };

/** The seat that has to decide next, with its legal choices. */
export interface PokerTurn {
  seatId: string;
  seatIdx: number;
  name: string;
  toCall: number;
  choices: PlayerChoice[];
}

/**
 * An event the step reports, in the order it happened. Each payload carries the game state as of that
 * moment, so consumers need no ordering or timing assumptions.
 */
export type PokerTableEvent =
  | { name: typeof PokerEvent.ACTION_TAKEN; payload: { player: string; action: PlayerAction; summary: string; gameState: PokerGameState } }
  | { name: typeof PokerEvent.PHASE_STREET; payload: { street: Street; gameState: PokerGameState } }
  | { name: typeof PokerEvent.PHASE_SETTLE; payload: { winnerSummary: string; gameState: PokerGameState } }
  | { name: typeof PokerEvent.NEW_ROUND; payload: { handNumber: number; gameState: PokerGameState } }
  | { name: typeof PokerEvent.PHASE_DEAL; payload: { street: Street; gameState: PokerGameState } };

export interface PokerTableStep {
  gameState: PokerGameState;
  turn: PokerTurn | null;
  events: PokerTableEvent[];
}

/** A runaway guard: hands where nobody can act (all-in runouts) settle inside a single reduction. */
const MAX_AUTO_STEPS = 64;

/** True when a seat still has to act on the current street. */
function needsAction(s: PokerGameState): boolean {
  if (s.handOver || s.streetComplete || s.currentStreet === PokerStreet.SHOWDOWN) return false;
  const live = s.players.filter((p) => !p.folded && !p.allIn);
  if (live.length === 0) return false;
  if (live.length === 1) return live[0].streetBet < s.currentBet;
  return true;
}

function isRunning(s: PokerGameState): boolean {
  return s.handNumber > 0 && !s.handOver && !s.gameOver;
}

function startHand(s: PokerGameState, events: PokerTableEvent[]): PokerGameState {
  const next = startPokerHand(s).gameState;
  events.push(
    { name: PokerEvent.NEW_ROUND, payload: { handNumber: next.handNumber, gameState: next } },
    { name: PokerEvent.PHASE_DEAL, payload: { street: next.currentStreet, gameState: next } },
  );
  return next;
}

/** Deals, settles and starts hands until a seat has to decide or the game is over. */
function advance(start: PokerGameState, events: PokerTableEvent[]): PokerGameState {
  let s = start;
  for (let i = 0; i < MAX_AUTO_STEPS && !s.gameOver; i++) {
    if (s.handOver || s.currentStreet === PokerStreet.SHOWDOWN) {
      const settled = distributePokerPots(s);
      events.push({ name: PokerEvent.PHASE_SETTLE, payload: { winnerSummary: settled.winnerSummary, gameState: settled.gameState } });
      // Game over commits the final standings into the state; the table flow announces it
      const over = checkPokerGameOver(settled.gameState);
      if (over.gameOver) return over.gameState;
      s = startHand(rotatePokerDealer(over.gameState).gameState, events);
      continue;
    }
    if (needsAction(s)) {
      const seat = s.players[s.activePlayerIdx];
      // The engine may point at a seat that can no longer act (all-in from the blinds)
      return seat && !seat.folded && !seat.allIn ? s : { ...s, activePlayerIdx: getNextActivePlayerIdx(s.players, s.activePlayerIdx) };
    }
    s = dealPokerStreet(s).gameState;
    events.push({ name: PokerEvent.PHASE_STREET, payload: { street: s.currentStreet, gameState: s } });
  }
  return s;
}

function turnOf(s: PokerGameState): PokerTurn | null {
  if (!isRunning(s) || !needsAction(s)) return null;
  const seat = s.players[s.activePlayerIdx];
  if (!seat) return null;
  return {
    seatId: seat.id,
    seatIdx: s.activePlayerIdx,
    name: seat.name,
    toCall: Math.max(0, (s.currentBet || 0) - (seat.streetBet || 0)),
    choices: getLegalChoices(s, s.activePlayerIdx),
  };
}

function step(gameState: PokerGameState, events: PokerTableEvent[]): PokerTableStep {
  return { gameState, turn: turnOf(gameState), events };
}

/** Applies one table command and advances the table to its next decision point. */
export function reduceTable(state: PokerGameState | undefined, command: PokerTableCommandInput): PokerTableStep {
  const events: PokerTableEvent[] = [];

  if (command.type === PokerTableCommand.BOOT) {
    return step(initPokerLobby(command.config).gameState, events);
  }
  if (!state) throw new Error(`reduceTable(${command.type}): the table is not booted`);

  switch (command.type) {
    case PokerTableCommand.JOIN:
      return step(joinPokerLobby(state, command.player).gameState, events);
    case PokerTableCommand.LEAVE:
      return step(leavePokerLobby(state, String(command.id)).gameState, events);
    case PokerTableCommand.START: {
      if (isRunning(state) || state.gameOver) return step(state, events);
      return step(advance(startHand(state, events), events), events);
    }
    case PokerTableCommand.ACT: {
      if (!isRunning(state)) return step(state, events);
      const acted = applyPokerAction(state, command.action).gameState;
      events.push({
        name: PokerEvent.ACTION_TAKEN,
        payload: {
          player: acted.lastActorName || '',
          action: { type: acted.lastActionType as PlayerAction['type'], ...(acted.lastActionAmount !== undefined ? { amount: acted.lastActionAmount } : {}) },
          summary: acted.lastActionSummary || '',
          gameState: acted,
        },
      });
      return step(advance(acted, events), events);
    }
    default:
      throw new Error(`reduceTable: unknown command ${(command as any)?.type}`);
  }
}
