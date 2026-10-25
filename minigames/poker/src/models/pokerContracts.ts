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
export const PokerTool = {
  INIT_LOBBY: 'poker_init_lobby',
  JOIN_LOBBY: 'poker_join_lobby',
  LEAVE_LOBBY: 'poker_leave_lobby',
  START_HAND: 'poker_start_hand',
  DEAL_STREET: 'poker_deal_street',
  DISTRIBUTE_POTS: 'poker_distribute_pots',
  APPLY_ACTION: 'poker_apply_action',
  GET_CHOICES: 'poker_get_choices',
  CHECK_GAME_OVER: 'poker_check_game_over',
  ROTATE_DEALER: 'poker_rotate_dealer',
  AI_DECISION: 'poker_ai_decision',
  LIST_TABLES: 'poker_list_tables',
  SPEECH: 'poker_speech',
  HUMAN_SPEECH: 'poker_human_speech',
  FAST_FORWARD: 'poker_fast_forward_board',
  GET_STANDINGS: 'poker_get_standings',
} as const;

export type PokerToolType = (typeof PokerTool)[keyof typeof PokerTool];

export const PokerToolAlias = {
  ACT: 'act',
  SPEECH: 'speech',
  STANDINGS: 'standings_tool',
  LIST_TABLES: 'list_tables',
} as const;

export type PokerToolAliasType = (typeof PokerToolAlias)[keyof typeof PokerToolAlias];

export const PokerToolUsage = {
  JOIN_LOBBY: '<actorId> <name> [chips] [seatIdx]',
  LEAVE_LOBBY: '<actorId>',
  APPLY_ACTION: '<actionType> [amount]',
  HUMAN_SPEECH: '<speak|whisper|message> [actor] <text>',
  GET_CHOICES: '[playerIdx]',
} as const;

export type PokerToolUsageType = (typeof PokerToolUsage)[keyof typeof PokerToolUsage];

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

export const PokerLobbyAction = {
  NEW: 'new',
  RESUME: 'resume',
  EXIT: 'exit',
} as const;

export type PokerLobbyActionType = (typeof PokerLobbyAction)[keyof typeof PokerLobbyAction];

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

export const DEFAULT_LOBBY_OPTIONS = [
  { id: PokerLobbyAction.NEW, label: 'New Game', description: 'Start fresh table' },
  { id: PokerLobbyAction.RESUME, label: 'Resume Game', description: 'Select from active/paused tables' },
  { id: PokerLobbyAction.EXIT, label: 'Exit', description: 'Quit session' },
] as const;

export const DEFAULT_LOBBY_CHOICES = [
  { id: PokerLobbyAction.NEW, label: 'New Game - Start fresh table', aliases: ['n'], event: PokerEvent.LOBBY_CHOICE, payload: { id: PokerLobbyAction.NEW }, value: { id: PokerLobbyAction.NEW } },
  { id: PokerLobbyAction.RESUME, label: 'Resume Game - Select from active/paused tables', aliases: ['r', 'continue'], event: PokerEvent.LOBBY_CHOICE, payload: { id: PokerLobbyAction.RESUME }, value: { id: PokerLobbyAction.RESUME } },
  { id: PokerLobbyAction.EXIT, label: 'Exit - Quit session', aliases: ['q', 'exit', 'quit'], event: PokerEvent.LOBBY_CHOICE, payload: { id: PokerLobbyAction.EXIT }, value: { id: PokerLobbyAction.EXIT } },
];

// ==========================================
// 5. Workflow Modules, Subroutines & Steps
// ==========================================
export const PokerModule = {
  WORKFLOW: 'poker_workflow',
  LOBBY: 'poker_lobby',
  ACTION: 'poker_action',
  PLAYER_TURN: 'player_turn',
  HUMAN_TURN: 'human_turn',
  AGENT_TURN: 'agent_turn',
  AMBIENT_REACTION: 'ambient_reaction',
} as const;

export type PokerModuleType = (typeof PokerModule)[keyof typeof PokerModule];

export const PokerStep = {
  // Action Module Steps
  APPLY_ACTION_STEP: 'poker:apply_action_step',
  APPLY_ACTION: 'poker:apply_action',

  // Lobby Module Steps
  LOBBY_MANAGER: 'poker:lobby_manager',
  LOBBY_GATE: 'poker:lobby_gate',
  EXIT_LOBBY: 'poker:exit_lobby',
  RESUME_TABLE_FLOW: 'poker:resume_table_flow',
  NEW_TABLE_FLOW: 'poker:new_table_flow',
  BOOT_TABLE: 'poker:boot_table',
  WAIT_FOR_PLAYERS: 'poker:wait_for_players',

  // Player Turn Steps
  PLAYER_TURN: 'poker:player_turn',
  HUMAN_TURN: 'poker:human_turn',
  HANDLE_PAUSE: 'poker:handle_pause',
  WAIT_RESUME: 'poker:wait_resume',
  UNPAUSE: 'poker:unpause',
  PAUSE_EXIT: 'poker:pause_exit',
  HANDLE_EXIT: 'poker:handle_exit',

  // Agent Turn Steps
  AGENT_TURN: 'poker:agent_turn',

  // Ambient Reaction Steps
  AMBIENT_REACTION: 'poker:ambient_reaction',
  HANDLE_SPEECH_EVENT: 'poker:handle_speech_event',
  HANDLE_ACTION_EVENT: 'poker:handle_action_event',

  // Master Workflow Engine Steps
  DYNAMIC_ENGINE: 'poker:dynamic_engine',
  SINGLE_HAND: 'poker:single_hand',
  STREET_LOOP: 'poker:street_loop',
  TURN_STEP: 'poker:turn_step',
  HUMAN_AGENT_FLOW: 'poker:human_agent_flow',
  AI_AGENT_FLOW: 'poker:ai_agent_flow',
  DEAL_NEXT_STREET: 'poker:deal_next_street',
  SETTLE_SHOWDOWN: 'poker:settle_showdown',
  PHASE_SETTLE_STEP: 'poker:phase_settle_step',
} as const;

export type PokerStepType = (typeof PokerStep)[keyof typeof PokerStep];
