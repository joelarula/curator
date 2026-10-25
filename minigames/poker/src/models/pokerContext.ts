/**
 * Pure TypeScript models for Texas Hold'em execution context, state, event payloads, and tool parameters.
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
import type {
  PokerTool,
} from './pokerContracts.ts';
import type {
  PokerLobbyChoice,
  PokerTableChoice,
  PokerLobbyActionType,
} from '../workflows/pokerLobby.ts';

// ==========================================
// 1. Tool Parameter Schemas
// ==========================================
export type WorkflowValue<T> = T | string;

export interface PokerInitialPlayerInput {
  id: string;
  name: string;
  instruction?: string;
  provider?: string;
  persona?: string;
  model?: string;
  isHuman?: boolean;
  chips?: number;
  wallet?: number;
  buyIn?: number;
  seatIdx?: number;
}

export interface PokerInitLobbyParams {
  tableId?: WorkflowValue<string>;
  startingChips?: WorkflowValue<number>;
  sbAmount?: WorkflowValue<number>;
  bbAmount?: WorkflowValue<number>;
  maxSeats?: WorkflowValue<number>;
  revealHandsOnSettle?: WorkflowValue<boolean>;
  maxHands?: WorkflowValue<number>;
  players?: WorkflowValue<PokerInitialPlayerInput[]>;
  wallets?: Record<string, number>;
  startingWallets?: Record<string, number>;
  playerName?: string;
}

export interface PokerJoinLobbyParams {
  state?: WorkflowValue<PokerGameState>;
  player?: WorkflowValue<PokerInitialPlayerInput | PlayerState>;
  id?: string;
  name?: string;
  instruction?: string;
  provider?: string;
  persona?: string;
  model?: string;
  isHuman?: boolean;
  wallet?: number;
  buyIn?: number;
  chips?: number;
  seatIdx?: number;
}

export interface PokerLeaveLobbyParams {
  state?: WorkflowValue<PokerGameState>;
  id: WorkflowValue<string>;
}

export interface PokerStartHandParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerAiDecisionParams {
  state?: WorkflowValue<PokerGameState>;
  playerIdx?: WorkflowValue<number>;
}

export interface PokerApplyActionParams {
  state?: WorkflowValue<PokerGameState>;
  action?: WorkflowValue<PlayerAction>;
}

export interface PokerDealStreetParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerFastForwardParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerDistributePotsParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerRotateDealerParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerHumanSpeechParams {
  state?: WorkflowValue<PokerGameState>;
  speechAct: WorkflowValue<SpeechAct>;
  text: WorkflowValue<string>;
  targetId?: WorkflowValue<string>;
  speakerId?: WorkflowValue<string>;
  speakerName?: WorkflowValue<string>;
}

export interface PokerCheckGameOverParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerGetStandingsParams {
  state?: WorkflowValue<PokerGameState>;
}

export interface PokerGetChoicesParams {
  state?: WorkflowValue<PokerGameState>;
  playerIdx?: WorkflowValue<number>;
}

export interface PokerListTablesParams {
  userId?: WorkflowValue<string>;
  playerName?: WorkflowValue<string>;
  playerId?: WorkflowValue<string>;
  projectId?: WorkflowValue<string>;
}

export interface PokerCreateTableParams {
  tableName?: WorkflowValue<string>;
  playerName?: WorkflowValue<string>;
  startingChips?: WorkflowValue<number>;
  smallBlind?: WorkflowValue<number>;
  bigBlind?: WorkflowValue<number>;
  maxSeats?: WorkflowValue<number>;
}

export interface PokerGetBankrollParams {
  userId?: WorkflowValue<string>;
  playerName?: WorkflowValue<string>;
  sbAmount?: WorkflowValue<number>;
  bbAmount?: WorkflowValue<number>;
}

export interface PokerDepositBuyInParams {
  userId?: WorkflowValue<string>;
  tableId?: WorkflowValue<string | number>;
  amount?: WorkflowValue<number>;
}

export interface PokerCashOutParams {
  userId?: WorkflowValue<string>;
  tableId?: WorkflowValue<string | number>;
  chips?: WorkflowValue<number>;
}

export interface PokerReloadBankrollParams {
  userId?: WorkflowValue<string>;
  amount?: WorkflowValue<number>;
}

export interface PokerToolParamsMap {
  [PokerTool.INIT_LOBBY]: PokerInitLobbyParams;
  [PokerTool.JOIN_LOBBY]: PokerJoinLobbyParams;
  [PokerTool.LEAVE_LOBBY]: PokerLeaveLobbyParams;
  [PokerTool.START_HAND]: PokerStartHandParams;
  [PokerTool.DEAL_STREET]: PokerDealStreetParams;
  [PokerTool.FAST_FORWARD]: PokerFastForwardParams;
  [PokerTool.DISTRIBUTE_POTS]: PokerDistributePotsParams;
  [PokerTool.ROTATE_DEALER]: PokerRotateDealerParams;
  [PokerTool.AI_DECISION]: PokerAiDecisionParams;
  [PokerTool.APPLY_ACTION]: PokerApplyActionParams;
  [PokerTool.HUMAN_SPEECH]: PokerHumanSpeechParams;
  [PokerTool.CHECK_GAME_OVER]: PokerCheckGameOverParams;
  [PokerTool.GET_STANDINGS]: PokerGetStandingsParams;
  [PokerTool.GET_CHOICES]: PokerGetChoicesParams;
  [PokerTool.LIST_TABLES]: PokerListTablesParams;
  [PokerTool.CREATE_TABLE]: PokerCreateTableParams;
  [PokerTool.GET_BANKROLL]: PokerGetBankrollParams;
  [PokerTool.DEPOSIT_BUY_IN]: PokerDepositBuyInParams;
  [PokerTool.CASH_OUT]: PokerCashOutParams;
  [PokerTool.RELOAD_BANKROLL]: PokerReloadBankrollParams;
}

// ==========================================
// 2. Table Config & Decisions
// ==========================================
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

export interface PokerLegalChoice {
  label: string;
  value: PlayerAction;
  toCall?: number;
  minRaise?: number;
  maxRaise?: number;
}

export interface PokerTurnDecision {
  action: PlayerAction;
  speech?: string;
  speechAct?: SpeechAct;
  innerMonologue?: string;
  recipientId?: string;
}

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

// ==========================================
// 3. Workflow Context, State & Params
// ==========================================
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
  lobbyChoice?: PokerLobbyChoice | { id: PokerLobbyActionType; label?: string } | string;
  lobbyChoices?: PokerLobbyChoice[];
  selectedTable?: PokerTableChoice | { id: string; tableId?: string } | string;
  buyInChoice?: any;
  buyInChoices?: any[];
  selectedBuyIn?: number;
  bankroll?: any;

  // Tool execution results cached in context under toolName
  poker_get_bankroll?: {
    balance: number;
    minBuyIn: number;
    maxBuyIn: number;
    canAfford: boolean;
    choices: any[];
  };
  poker_deposit_buy_in?: {
    success: boolean;
    newBalance: number;
    deposited: number;
  };
  poker_cash_out?: {
    success: boolean;
    newBalance: number;
    cashedOut: number;
  };
  poker_reload_bankroll?: {
    balance: number;
  };
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
  poker_list_tables?: {
    tables: Array<{ id: string; tableId: string; title: string }>;
    choices: PokerTableChoice[];
    lobbyChoices?: PokerLobbyChoice[];
    hasUnfinishedGames: boolean;
    count: number;
  };

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

export interface PokerWorkflowState {
  isPaused?: boolean;
  sessionEnded?: boolean;
  handCount?: number;
  lastWinnerId?: string;
  [key: string]: any;
}

export interface PokerWorkflowParams {
  tableId?: string;
  action?: PlayerAction;
  playerId?: string;
  amount?: number;
  [key: string]: any;
}

// ==========================================
// 4. Event Map
// ==========================================
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
