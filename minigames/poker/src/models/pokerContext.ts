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
import { createContextProxy, type TypedPathProxy } from '../curator.ts';

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
/** Fields shared by every flow: identity, blinds and the live game state. */
export interface PokerSharedContext {
  gameState?: PokerGameState;
  tableId?: string;
  playerName?: string;
  userId?: string;
  playerId?: string;
  sbAmount?: number;
  bbAmount?: number;
  isPaused?: boolean;
  sessionEnded?: boolean;
  event?: {
    type: string;
    tableId?: string;
    payload?: any;
    [key: string]: any;
  };
}

/** Buy-in sub-flow: bankroll lookup, optional reload and chip deposit. */
export interface PokerBankrollContext extends PokerSharedContext {
  buyInChoice?: any;
  selectedBuyIn?: number;
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
  poker_reload_bankroll?: {
    balance: number;
  };
}

/** Table boot sub-flow: open-table initialization and dynamic seating. */
export interface PokerBootContext extends PokerSharedContext {
  startingChips?: number;
  maxSeats?: number;
  players?: PlayerJoinOptions[];
  joinRequest?: PlayerJoinOptions;
}

/** Lobby flow proper: table listing/selection, composed with its buy-in and boot sub-flows. */
export interface PokerLobbyContext extends PokerBankrollContext, PokerBootContext {
  bypassLobby?: boolean;
  lobbyChoice?: PokerLobbyChoice | { id: PokerLobbyActionType; label?: string } | string;
  lobbyChoices?: PokerLobbyChoice[];
  selectedTable?: PokerTableChoice | { id: string; tableId?: string } | string;

  poker_create_table?: { tableId?: string; [key: string]: any };
  poker_list_tables?: {
    tables: Array<{ id: string; tableId: string; title: string }>;
    choices: PokerTableChoice[];
    lobbyChoices?: PokerLobbyChoice[];
    hasUnfinishedGames: boolean;
    count: number;
  };
}

/** Hand lifecycle flow: dealing, street progression, settlement, game over. */
export interface PokerTableContext extends PokerSharedContext {
  winnerSummary?: string;
  standings?: PlayerStanding[];
  poker_start_hand?: { gameState: PokerGameState };
  poker_deal_street?: { gameState: PokerGameState };
  poker_distribute_pots?: { gameState: PokerGameState };
  poker_check_game_over?: { gameOver: boolean; standings?: PlayerStanding[] };
  poker_rotate_dealer?: { gameState: PokerGameState };
}

/** Player turn flows (agent, human, action application). */
export interface PokerTurnContext extends PokerSharedContext {
  activePlayer?: PlayerState;
  player?: PlayerState;
  action?: PlayerAction;
  turnAction?: PlayerAction;
  humanAction?: PlayerAction;
  lastAiAction?: PlayerAction;
  resumeCmd?: { type: 'RESUME' | 'EXIT' } | string;
  choices?: PokerLegalChoice[];
  decision?: PokerTurnDecision;
  recentRemarks?: AmbientRemark[];
  poker_get_choices?: { choices: PokerLegalChoice[] };
  poker_ai_decision?: PokerTurnDecision;
  poker_apply_action?: { gameState: PokerGameState };
}

/** Ambient table-talk reaction flow. */
export interface PokerAmbientContext extends PokerSharedContext {
  recentRemarks?: AmbientRemark[];
  speech?: string;
  speechAct?: SpeechAct;
  text?: string;
  speakerName?: string;
  eventSpeechAct?: SpeechAct;
  eventTargetId?: string;
  eventText?: string;
}

/** Root context of the top-level poker workflow: union of all flow contexts. */
export interface PokerWorkflowContext
  extends PokerLobbyContext,
    PokerTableContext,
    PokerTurnContext,
    PokerAmbientContext {
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

export const ctx: TypedPathProxy<PokerWorkflowContext> = createContextProxy<PokerWorkflowContext>('$context');
export const lobbyCtx: TypedPathProxy<PokerLobbyContext> = createContextProxy<PokerLobbyContext>('$context');
export const bankrollCtx: TypedPathProxy<PokerBankrollContext> = createContextProxy<PokerBankrollContext>('$context');
export const bootCtx: TypedPathProxy<PokerBootContext> = createContextProxy<PokerBootContext>('$context');
export const tableCtx: TypedPathProxy<PokerTableContext> = createContextProxy<PokerTableContext>('$context');
export const turnCtx: TypedPathProxy<PokerTurnContext> = createContextProxy<PokerTurnContext>('$context');
export const ambientCtx: TypedPathProxy<PokerAmbientContext> = createContextProxy<PokerAmbientContext>('$context');
export const gameState: TypedPathProxy<PokerGameState> = createContextProxy<PokerGameState>('$context.gameState');
export const state: TypedPathProxy<PokerWorkflowState> = createContextProxy<PokerWorkflowState>('$state');
export const params: TypedPathProxy<PokerWorkflowParams> = createContextProxy<PokerWorkflowParams>('$params');

