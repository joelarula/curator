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
  PokerLobbyTable,
  PokerLobbyMenu,
} from './pokerLobbyMenu.ts';
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

/** No parameters: identity and project scope are resolved from the host session. */
export type PokerListTablesParams = Record<string, never>;

export interface PokerLobbyMenuParams {
  tables?: WorkflowValue<PokerLobbyTable[]>;
}

export interface PokerCreateTableParams {
  tableName?: WorkflowValue<string>;
  playerName?: WorkflowValue<string>;
  startingChips?: WorkflowValue<number>;
  smallBlind?: WorkflowValue<number>;
  bigBlind?: WorkflowValue<number>;
  maxSeats?: WorkflowValue<number>;
}

/** Wallet owner is always the host session user; no identity params. */
export type PokerGetBankrollParams = Record<string, never>;

export interface PokerGetBuyInOptionsParams {
  bbAmount?: WorkflowValue<number>;
}

export interface PokerDepositBuyInParams {
  tableId?: WorkflowValue<string | number>;
  amount?: WorkflowValue<number>;
  bbAmount?: WorkflowValue<number>;
}

export interface PokerCashOutParams {
  tableId?: WorkflowValue<string | number>;
  chips?: WorkflowValue<number>;
}

export interface PokerReloadBankrollParams {
  /** Free-form amount: number, "$5,000", "5k" or a reload choice object. */
  amount?: WorkflowValue<number | string>;
}

export interface PokerCloseTableParams {
  reason?: WorkflowValue<string>;
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
  [PokerTool.LOBBY_MENU]: PokerLobbyMenuParams;
  [PokerTool.CREATE_TABLE]: PokerCreateTableParams;
  [PokerTool.GET_BANKROLL]: PokerGetBankrollParams;
  [PokerTool.GET_BUY_IN_OPTIONS]: PokerGetBuyInOptionsParams;
  [PokerTool.DEPOSIT_BUY_IN]: PokerDepositBuyInParams;
  [PokerTool.CASH_OUT]: PokerCashOutParams;
  [PokerTool.RELOAD_BANKROLL]: PokerReloadBankrollParams;
  [PokerTool.CLOSE_TABLE]: PokerCloseTableParams;
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
  /** Live event-sourced conversation state; closures read game and lifecycle state from here. */
  state?: PokerWorkflowState;
  gameState?: PokerGameState;
  tableId?: string;
  actorId?: string;
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
  bankroll?: {
    balance: number;
    currency: string;
    formattedBalance: string;
  };
  buyInOptions?: {
    balance: number;
    minBuyIn: number;
    maxBuyIn: number;
    canAfford: boolean;
    choices: any[];
  };
  buyInDeposit?: {
    success: boolean;
    newBalance: number;
    deposited: number;
  };
  reloadChoice?: any;
  reload?: {
    success: boolean;
    added: number;
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
  lobbyChoice?: PokerLobbyChoice | { id: PokerLobbyActionType; label?: string } | string;
  selectedTable?: PokerTableChoice | { id: string } | string;

  // Tool results, each bound explicitly with `{ as }` in the lobby workflow
  openTables?: { tables: PokerLobbyTable[] };
  lobbyMenu?: PokerLobbyMenu;
  newTable?: { tableId?: string; [key: string]: any };
}

/** Hand lifecycle flow: dealing, street progression, settlement, game over. */
export interface PokerTableContext extends PokerSharedContext {
  winnerSummary?: string;
  standings?: PlayerStanding[];
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
  /** poker_get_choices result, bound with `{ as }` in the human turn */
  legalChoices?: { choices: PokerLegalChoice[] };
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

/**
 * Conversation state (event-sourced). The lifecycle keys below are projected into the table's
 * PokerTableShape triples by `pokerTableProjector`.
 */
export interface PokerWorkflowState {
  /** Written by every engine tool step (its output is appended to the state log). */
  gameState?: PokerGameState;
  /** The run's table settings, handed to the isolated boot subroutine. */
  tableConfig?: {
    tableId?: string;
    startingChips?: number;
    sbAmount?: number;
    bbAmount?: number;
    maxSeats?: number;
    players?: any[];
    playerName?: string;
  };
  isPaused?: boolean;
  sessionEnded?: boolean;
  gameOver?: boolean;
  isClosed?: boolean;
  /** Active state of the table / lobby state machines. */
  tablePhase?: string;
  lobbyPhase?: string;
  /** The current seat's decision, written by its actor handler. */
  turnAction?: PlayerAction;
  /** RESUME or EXIT while the table is paused. */
  resumeCmd?: { type: 'RESUME' | 'EXIT' } | string;
  seatedPlayers?: Array<{ id: string; name?: string; isHuman?: boolean }>;
  /** Written by the engine when the table workflow crashes. */
  lastFailure?: { requestId: number; nodeId: string | null; nodeType: string | null; reason: string; failedAt: string };
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
// Game and lifecycle state are read from the event-sourced conversation state, never from request-context copies
export const gameState: TypedPathProxy<PokerGameState> = createContextProxy<PokerGameState>('$state.gameState');
export const state: TypedPathProxy<PokerWorkflowState> = createContextProxy<PokerWorkflowState>('$state');
export const params: TypedPathProxy<PokerWorkflowParams> = createContextProxy<PokerWorkflowParams>('$params');
/** The seat an actor handler is playing (Bevy component of the acting entity). */
export const actor: TypedPathProxy<PlayerState> = createContextProxy<PlayerState>('$params.actor');

