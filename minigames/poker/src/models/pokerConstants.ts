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

export const PokerSpeechAct = {
  TABLE_TALK: 'TABLE_TALK',
  BANTER: 'BANTER',
  WHISPER: 'WHISPER',
  PROVOKE: 'PROVOKE',
} as const;

export type PokerSpeechActType = (typeof PokerSpeechAct)[keyof typeof PokerSpeechAct];

export const PokerLobbyAction = {
  NEW: 'new',
  RESUME: 'resume',
  EXIT: 'exit',
} as const;

export type PokerLobbyActionType = (typeof PokerLobbyAction)[keyof typeof PokerLobbyAction];

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
