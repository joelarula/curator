/**
 * Type guards and runtime assertions for Poker models.
 */

import {
  type Card,
  type Street,
  type ActionType,
  type PlayerAction,
  type PlayerState,
  type PokerGameState,
  PokerStreet,
  PokerActionType,
  SUITS,
  RANKS,
} from '../types.ts';
import type { PokerWorkflowContext, PokerLegalChoice, PokerTurnDecision } from './pokerContext.ts';

const VALID_STREETS = new Set<string>(Object.values(PokerStreet));
const VALID_ACTIONS = new Set<string>(Object.values(PokerActionType));
const VALID_SUITS = new Set<string>(SUITS);
const VALID_RANKS = new Set<string>(RANKS);

export function isCard(value: unknown): value is Card {
  if (!value || typeof value !== 'object') return false;
  const c = value as Card;
  return VALID_RANKS.has(c.rank) && VALID_SUITS.has(c.suit);
}

export function isStreet(value: unknown): value is Street {
  return typeof value === 'string' && VALID_STREETS.has(value as Street);
}

export function isActionType(value: unknown): value is ActionType {
  return typeof value === 'string' && VALID_ACTIONS.has(value as ActionType);
}

export function isPlayerAction(value: unknown): value is PlayerAction {
  if (!value || typeof value !== 'object') return false;
  const a = value as PlayerAction;
  return isActionType(a.type) && (a.amount === undefined || typeof a.amount === 'number');
}

export function isPlayerState(value: unknown): value is PlayerState {
  if (!value || typeof value !== 'object') return false;
  const p = value as PlayerState;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.isHuman === 'boolean' &&
    typeof p.chips === 'number' &&
    typeof p.streetBet === 'number' &&
    typeof p.totalHandBet === 'number' &&
    Array.isArray(p.holeCards) &&
    typeof p.folded === 'boolean' &&
    typeof p.allIn === 'boolean' &&
    typeof p.seatIdx === 'number'
  );
}

export function isPokerGameState(value: unknown): value is PokerGameState {
  if (!value || typeof value !== 'object') return false;
  const s = value as any;
  return (
    typeof s.tableId === 'string' &&
    typeof s.pot === 'number' &&
    (s.currentStreet === undefined || isStreet(s.currentStreet)) &&
    (s.board === undefined || Array.isArray(s.board)) &&
    Array.isArray(s.players)
  );
}

export function isPokerWorkflowContext(value: unknown): value is PokerWorkflowContext {
  if (!value || typeof value !== 'object') return false;
  const ctx = value as PokerWorkflowContext;
  return ctx.gameState === undefined || isPokerGameState(ctx.gameState);
}

export function isPokerLegalChoice(value: unknown): value is PokerLegalChoice {
  if (!value || typeof value !== 'object') return false;
  const c = value as PokerLegalChoice;
  return typeof c.label === 'string' && isPlayerAction(c.value);
}

export function isPokerTurnDecision(value: unknown): value is PokerTurnDecision {
  if (!value || typeof value !== 'object') return false;
  const d = value as PokerTurnDecision;
  return isPlayerAction(d.action);
}
