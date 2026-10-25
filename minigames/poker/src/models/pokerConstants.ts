import { AmbientSpeechAct, type AmbientSpeechActType } from '../curator.ts';

export { AmbientSpeechAct, type AmbientSpeechActType };

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

export const DEFAULT_LOBBY_OPTIONS = [
  { id: PokerLobbyAction.NEW, label: 'New Game', description: 'Start fresh table' },
  { id: PokerLobbyAction.RESUME, label: 'Resume Game', description: 'Select from active/paused tables' },
  { id: PokerLobbyAction.EXIT, label: 'Exit', description: 'Quit session' },
] as const;

export const DEFAULT_LOBBY_CHOICES = [
  { id: PokerLobbyAction.NEW, label: 'New Game - Start fresh table', aliases: ['n'], event: 'poker:lobby_choice', payload: { id: PokerLobbyAction.NEW }, value: { id: PokerLobbyAction.NEW } },
  { id: PokerLobbyAction.RESUME, label: 'Resume Game - Select from active/paused tables', aliases: ['r', 'continue'], event: 'poker:lobby_choice', payload: { id: PokerLobbyAction.RESUME }, value: { id: PokerLobbyAction.RESUME } },
  { id: PokerLobbyAction.EXIT, label: 'Exit - Quit session', aliases: ['q', 'exit', 'quit'], event: 'poker:lobby_choice', payload: { id: PokerLobbyAction.EXIT }, value: { id: PokerLobbyAction.EXIT } },
];

