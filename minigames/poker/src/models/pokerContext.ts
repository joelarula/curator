/**
 * Pure TypeScript models for Texas Hold'em execution context, state, and event payloads.
 * Provides compile-time type safety for workflow scripts, AST expressions, and plugin runtime.
 */

import type {
  Card,
  Street,
  ActionType,
  SpeechAct,
  PlayerAction,
  PlayerState,
  PokerGameState,
  PlayerJoinOptions,
  PlayerStanding,
  AmbientRemark,
} from '../types.ts';

/**
 * Options used to initialize or configure a Texas Hold'em table.
 */
export interface PokerTableConfig {
  tableId: string;
  startingChips: number;
  sbAmount: number;
  bbAmount: number;
  maxSeats: number;
  maxHands?: number;
  revealHandsOnSettle?: boolean;
  players?: PlayerJoinOptions[];
}

/**
 * Choice descriptor presented to interactive human players or autonomous decision engines.
 */
export interface PokerLegalChoice {
  label: string;
  value: PlayerAction;
  toCall?: number;
  minRaise?: number;
  maxRaise?: number;
}

/**
 * Deliberation output produced by an autonomous poker agent.
 */
export interface PokerTurnDecision {
  action: PlayerAction;
  speech?: string;
  speechAct?: SpeechAct;
  innerMonologue?: string;
  recipientId?: string;
}

/**
 * Detailed settlement record for a completed hand.
 */
export interface PokerHandResult {
  handNumber: number;
  board: Card[];
  pot: number;
  winners: Array<{
    playerId: string;
    playerName?: string;
    amount: number;
    handDescription?: string;
  }>;
  showdownCards?: Record<string, Card[]>;
}

/**
 * Full strongly-typed representation of $context across all poker workflows.
 * Captures all tool outputs, events, parameters, and active game states.
 */
export interface PokerWorkflowContext {
  // Primary table game state
  gameState?: PokerGameState;

  // Session flags and configuration
  tableId?: string;
  bypassLobby?: boolean;
  playerName?: string;
  startingChips?: number;
  sbAmount?: number;
  bbAmount?: number;
  maxSeats?: number;
  isPaused?: boolean;
  sessionEnded?: boolean;

  // Active player and turn dynamics
  activePlayer?: PlayerState;
  player?: PlayerState;
  action?: PlayerAction;
  humanAction?: PlayerAction;
  lastAiAction?: PlayerAction;
  resumeCmd?: { type: 'RESUME' | 'EXIT' } | string;

  // Seating and lobby requests
  players?: PlayerJoinOptions[];
  joinRequest?: PlayerJoinOptions;

  // Choices and agent decisions
  choices?: PokerLegalChoice[];
  decision?: PokerTurnDecision;
  lobbyChoice?: { id: string; label?: string } | string;
  selectedTable?: { id: string; tableId?: string } | string;

  // Tool execution results cached in context under toolName
  poker_init_lobby?: { gameState: PokerGameState };
  poker_start_hand?: { gameState: PokerGameState };
  poker_get_choices?: { choices: PokerLegalChoice[] };
  poker_ai_decision?: PokerTurnDecision;
  poker_apply_action?: { gameState: PokerGameState };
  poker_deal_street?: { gameState: PokerGameState };
  poker_distribute_pots?: { gameState: PokerGameState };
  poker_check_game_over?: { gameOver: boolean; standings?: PlayerStanding[] };
  poker_rotate_dealer?: { gameState: PokerGameState };
  poker_join_lobby?: { gameState: PokerGameState };

  // Discourse and table remarks
  recentRemarks?: AmbientRemark[];
  speech?: string;
  speechAct?: SpeechAct;

  // Event context
  event?: {
    type: string;
    tableId?: string;
    payload?: any;
    [key: string]: any;
  };

  [key: string]: any;
}

/**
 * Strongly-typed representation of $state for poker workflow execution.
 */
export interface PokerWorkflowState {
  isPaused?: boolean;
  sessionEnded?: boolean;
  handCount?: number;
  lastWinnerId?: string;
  [key: string]: any;
}

/**
 * Strongly-typed representation of $params passed to workflow subroutines.
 */
export interface PokerWorkflowParams {
  tableId?: string;
  action?: PlayerAction;
  playerId?: string;
  amount?: number;
  [key: string]: any;
}

/**
 * Event-to-payload map defining all poker domain events emitted by the game loop.
 */
export interface PokerEventMap {
  'poker:lobby_ready': { tableId: string };
  'poker:table_ready': { tableId: string; playerCount: number };
  'poker:awaiting_players': { tableId: string; seatedCount: number };
  'poker:player_joined': PlayerJoinOptions;
  'poker:new_round': { tableId: string; handNumber: number };
  'poker:phase_deal': { tableId: string; handNumber: number; street: Street };
  'poker:phase_street': { tableId: string; street: Street; board: Card[] };
  'poker:action_taken': { tableId: string; playerId: string; action: PlayerAction };
  'poker:action_applied': { tableId: string; action: PlayerAction };
  'poker:phase_settle': { tableId: string; handNumber: number; pot: number };
  'poker:ambient_evaluated': { tableId: string; speakerId?: string; remark?: AmbientRemark };
  'poker:table_paused': { tableId: string };
  'poker:table_resumed': { tableId: string };
  'poker:resume_action': { type: 'RESUME' | 'EXIT' } | string;
  'poker:session_exited': { reason: string };
  'poker:game_over': { tableId: string; standings: PlayerStanding[] };
}
