/**
 * Poker Domain Contracts: Roles, Tools, Events, Constants, Modules, and Steps.
 * Single unified source of truth for all Poker identifiers, enums, and constants.
 */

// ==========================================
// 1. Domain Security Roles (RBAC)
// ==========================================
export const PokerRole = {
  ADMIN: 'poker:admin',
  DEALER: 'poker:dealer',
  PLAYER: 'poker:player',
  SPECTATOR: 'poker:spectator',
} as const;

export type PokerRole = (typeof PokerRole)[keyof typeof PokerRole];

// ==========================================
// 2. Tool Identifiers & Usage
// ==========================================
/** Pure reducers the plugin registers; flows run them with `reduce(name, args)`. */
export const PokerReducer = {
  /** The table reducer (engine/pokerTable.ts): the only way flows reach the deterministic engine. */
  TABLE: 'poker_table_command',
} as const;

/** Tools: everything that touches the database or the session user. */
export const PokerTool = {
  GET_STANDINGS: 'poker_get_standings',
  LIST_TABLES: 'poker_list_tables',
  CREATE_TABLE: 'poker_create_table',
  GET_BANKROLL: 'poker_get_bankroll',
  GET_BUY_IN_OPTIONS: 'poker_get_buy_in_options',
  DEPOSIT_BUY_IN: 'poker_deposit_buy_in',
  CASH_OUT: 'poker_cash_out',
  RELOAD_BANKROLL: 'poker_reload_bankroll',
  CLOSE_TABLE: 'poker_close_table',
} as const;

export type PokerToolType = (typeof PokerTool)[keyof typeof PokerTool];

export const PokerConversationType = {
  LOBBY: 'poker_lobby',
  TABLE: 'poker_table',
} as const;

export type PokerConversationType = (typeof PokerConversationType)[keyof typeof PokerConversationType];

export const PokerToolAlias = {
  STANDINGS: 'standings_tool',
  LIST_TABLES: 'list_tables',
} as const;

export type PokerToolAliasType = (typeof PokerToolAlias)[keyof typeof PokerToolAlias];

export function isPokerTool(value: unknown): value is PokerToolType {
  return typeof value === 'string' && Object.values(PokerTool).includes(value as PokerToolType);
}

// ==========================================
// 3. Domain Events
// ==========================================
export const PokerEvent = {
  // Lobby & Seating
  LOBBY_READY: 'poker:lobby_ready',
  AWAITING_PLAYERS: 'poker:awaiting_players',
  PLAYER_JOINED: 'poker:player_joined',
  TABLE_READY: 'poker:table_ready',
  TABLE_SELECTED: 'poker:table_selected',
  HUMAN_ACTION: 'poker:human_action',
  LOBBY_CHOICE: 'poker:lobby_choice',
  BUY_IN_CHOICE: 'poker:buy_in_choice',
  BANKROLL_UPDATED: 'poker:bankroll_updated',

  // Hand & Street Lifecycle
  NEW_ROUND: 'poker:new_round',
  PHASE_DEAL: 'poker:phase_deal',
  PHASE_STREET: 'poker:phase_street',
  PHASE_SETTLE: 'poker:phase_settle',
  SHOWDOWN: 'poker:showdown',
  GAME_OVER: 'poker:game_over',

  // Session Control
  PAUSE: 'poker:pause',
  RESUME: 'poker:resume',
  TABLE_PAUSED: 'poker:table_paused',
  RESUME_ACTION: 'poker:resume_action',
  TABLE_RESUMED: 'poker:table_resumed',
  SESSION_EXITED: 'poker:session_exited',
  TABLE_CREATED: 'poker:table_created',
  REQUEST_TABLE_SELECTION: 'poker:request_table_selection',
  LOBBY_PROMPT: 'poker:lobby_prompt',
  GET_ACTORS: 'poker:get_actors',
  LIST_TABLES: 'poker:list_tables',
  RESET_LIGHT: 'poker:reset_light',
  TOOL_CALL: 'poker:tool_call',

  // Actions & Execution
  ACTION_INTENT: 'poker:action_intent',
  ACTION_VALIDATED: 'poker:action_validated',
  ACTION_REJECTED: 'poker:action_rejected',
  ACTION_RESOLVED: 'poker:action_resolved',
  ACTION_APPLIED: 'poker:action_applied',
  ACTION_TAKEN: 'poker:action_taken',
  AWAITING_HUMAN_ACTION: 'poker:awaiting_human_action',

  // Ambient & Table Talk
  SPEECH: 'poker:speech',
  SPEECH_RESPONSE: 'poker:speech_response',
  AMBIENT_SPOKEN: 'poker:ambient_spoken',
  AMBIENT_EVALUATED: 'poker:ambient_evaluated',
  ACTORS_LIST: 'poker:actors_list',
} as const;

export type PokerEventType = (typeof PokerEvent)[keyof typeof PokerEvent];

export function isPokerEvent(value: unknown): value is PokerEventType {
  return typeof value === 'string' && Object.values(PokerEvent).includes(value as PokerEventType);
}

// ==========================================
// 4. Session, Actions, Streets & Lobby Constants
// ==========================================
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

export const PokerStandingStatus = {
  WINNER: 'Winner',
  ACTIVE: 'Active',
  BUST: 'Bust',
  CASHED_OUT: 'Cashed Out',
} as const;

export type PokerStandingStatusType = (typeof PokerStandingStatus)[keyof typeof PokerStandingStatus];

export const PokerSpeechAct = {
  TABLE_TALK: 'TABLE_TALK',
  WHISPER: 'WHISPER',
  BANTER: 'BANTER',
  PROVOKE: 'PROVOKE',
  GOSSIP: 'GOSSIP',
} as const;

export type SpeechAct = (typeof PokerSpeechAct)[keyof typeof PokerSpeechAct] | string;

export const PokerGameOverResult = {
  GAME_OVER: 'GAME_OVER',
  CONTINUE: 'CONTINUE',
} as const;

export type PokerGameOverResultType = (typeof PokerGameOverResult)[keyof typeof PokerGameOverResult];

// ==========================================
// 5. Workflow Modules, Subroutines & Steps
// ==========================================
export const PokerModule = {
  WORKFLOW: 'poker_workflow',
  LOBBY: 'poker_lobby',
  RULES: 'poker_rules',
  PLAYER_TURN: 'player_turn',
  HUMAN_TURN: 'human_turn',
  AGENT_TURN: 'agent_turn',
  AMBIENT_REACTION: 'ambient_reaction',
} as const;

export type PokerModuleType = (typeof PokerModule)[keyof typeof PokerModule];

export const PokerStep = {
  // Lobby
  LOBBY_MANAGER: 'poker:lobby_manager',
  BOOT_TABLE: 'poker:boot_table',
  WAIT_FOR_PLAYERS: 'poker:wait_for_players',
  HANDLE_EXIT: 'poker:handle_exit',

  // Table
  DYNAMIC_ENGINE: 'poker:dynamic_engine',
  TABLE_PHASES: 'poker:table_phases',
} as const;

export type PokerStepType = (typeof PokerStep)[keyof typeof PokerStep];

/** States of the table game-loop state machine, mirrored into conversation state under `TABLE_PHASE_KEY`. */
export const PokerTablePhase = {
  BOOT: 'BOOT',
  BETTING: 'BETTING',
  SUBMIT: 'SUBMIT',
  PAUSED: 'PAUSED',
  EXITED: 'EXITED',
  GAME_OVER: 'GAME_OVER',
} as const;

export type PokerTablePhaseType = (typeof PokerTablePhase)[keyof typeof PokerTablePhase];

export const TABLE_PHASE_KEY = 'tablePhase';

/** States of the lounge state machine, mirrored into conversation state under `LOBBY_PHASE_KEY`. */
export const PokerLobbyPhase = {
  MENU: 'MENU',
  PICK_TABLE: 'PICK_TABLE',
  NEW_TABLE: 'NEW_TABLE',
  BUY_IN: 'BUY_IN',
  RELOAD: 'RELOAD',
  DEPOSIT: 'DEPOSIT',
  BOOT: 'BOOT',
  EXIT: 'EXIT',
} as const;

export const LOBBY_PHASE_KEY = 'lobbyPhase';

// ==========================================
// 6. Client Transport & Runtime Constants
// ==========================================
export const PokerClientConstant = {
  DEFAULT_PLAYER_NAME: 'You',
  DEFAULT_TABLE_ID: 'poker:high_roller_lounge',
  ENV_SERVER_URL: 'POKER_SERVER_URL',
  DEFAULT_WS_PATH: '/api/events',
  BACK_CHOICE_ID: 'back',
  ACTION_CONTEXT_KEY: 'action',
  LOBBY_PHASE: 'LOBBY',
  LOBBY_WAITING_STATUS: 'WAITING_FOR_LOBBY_CHOICE',
} as const;

export const CuratorCoreEvent = {
  CHOICES: 'curator:choices',
  HUMAN_INPUT: 'curator:human_input',
  CHOICE: 'curator:choice',
  EXIT: 'curator:exit',
} as const;

// ==========================================
// 7. Domain Payload Normalization Helpers
// ==========================================
export interface ChoiceOption {
  action: string;
  amount?: number;
  min?: number;
  max?: number;
  label?: string;
  [key: string]: any;
}

/**
 * Normalizes legal choice options from any AST event payload,
 * accommodating string arrays, nested objects, or options dictionaries.
 */
export function normalizeChoices(rawChoices: any[] | undefined): ChoiceOption[] {
  if (!rawChoices) return [];
  const list = Array.isArray(rawChoices)
    ? rawChoices
    : Array.isArray((rawChoices as any)?.choices)
      ? (rawChoices as any).choices
      : Array.isArray((rawChoices as any)?.options)
        ? (rawChoices as any).options
        : [];

  return list.map((c) => {
    if (typeof c === 'string') {
      return { action: c, label: c };
    }
    const action = c.action || c.type || 'check';
    return {
      ...c,
      action,
      amount: c.amount,
      min: c.min,
      max: c.max,
      label: c.label || (c.amount !== undefined ? `${action} $${c.amount}` : action),
    };
  });
}

/**
 * Robustly extracts PokerGameState from event payloads or table metadata,
 * handling serialized JSON strings (common with SQLite) and direct objects.
 */
export function extractGameState<T = any>(payload: any): T | null {
  if (!payload) return null;
  const raw = payload.gameState !== undefined ? payload.gameState : payload.state;
  if (!raw) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
  return typeof raw === 'object' ? (raw as T) : null;
}
