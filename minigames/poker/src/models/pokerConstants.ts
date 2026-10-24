/**
 * Poker Domain Constants
 * Eliminates literal strings for session reasons, speech acts, lobby actions, and player action types.
 */

export const PokerSessionReason = {
  USER_EXIT: 'user_exit',
  GAME_OVER: 'game_over',
  TIMEOUT: 'timeout',
  TABLE_CLOSED: 'table_closed',
} as const;

export type PokerSessionReasonType = (typeof PokerSessionReason)[keyof typeof PokerSessionReason];

export const PokerActionType = {
  FOLD: 'FOLD',
  CHECK: 'CHECK',
  CALL: 'CALL',
  RAISE: 'RAISE',
  ALL_IN: 'ALL_IN',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  EXIT: 'EXIT',
} as const;

export type PokerActionTypeValue = (typeof PokerActionType)[keyof typeof PokerActionType];

export const PokerStreet = {
  PREFLOP: 'PREFLOP',
  FLOP: 'FLOP',
  TURN: 'TURN',
  RIVER: 'RIVER',
  SHOWDOWN: 'SHOWDOWN',
} as const;

export type PokerStreetType = (typeof PokerStreet)[keyof typeof PokerStreet];

export const PokerLobbyAction = {
  NEW: 'new',
  RESUME: 'resume',
  EXIT: 'exit',
} as const;

export type PokerLobbyActionType = (typeof PokerLobbyAction)[keyof typeof PokerLobbyAction];

