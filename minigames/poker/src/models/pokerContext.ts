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
  AmbientRemark,
} from '../types.ts';
import type {
  PokerTool,
} from './pokerContracts.ts';
import type { PokerTableCommandInput, PokerTurn, PokerTableEvent } from '../engine/pokerTable.ts';
import type { TableTalkState } from '../engine/tableTalk.ts';
import type {
  PokerLobbyChoice,
  PokerTableChoice,
  PokerLobbyActionType,
  PokerLobbyTable,
  PokerLobbyMenu,
} from './pokerLobbyMenu.ts';
import {
  createContextProxy,
  createWorkflowScope,
  type TypedPathProxy,
  type CuratorExpr,
} from '../curator.ts';

// ==========================================
// 1. Tool Parameter Schemas
// ==========================================
export type WorkflowValue<T> = CuratorExpr<T>;

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

/** Table reducer args: the command, applied to `state` (the live `$state.gameState` by default). */
export interface PokerTableParams {
  state?: WorkflowValue<PokerGameState>;
  command: WorkflowValue<PokerTableCommandInput>;
}

export interface PokerGetStandingsParams {
  state?: WorkflowValue<PokerGameState>;
}

/** No parameters: identity and project scope are resolved from the host session. */
export type PokerListTablesParams = Record<string, never>;

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
  bbAmount?: number;
}

export interface PokerDepositBuyInParams {
  tableId?: string | number;
  amount?: number | string;
  bbAmount?: number;
}

export interface PokerCashOutParams {
  tableId?: string | number;
  chips?: number;
}

export interface PokerReloadBankrollParams {
  /** Free-form amount: number, "$5,000", "5k" or a reload choice object. */
  amount?: number | string | Record<string, any>;
}

export interface PokerCloseTableParams {
  reason?: string;
}

export interface PokerToolParamsMap {
  [PokerTool.GET_STANDINGS]: PokerGetStandingsParams;
  [PokerTool.LIST_TABLES]: PokerListTablesParams;
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
  openTables?: { tables: PokerLobbyTable[] } & PokerLobbyMenu;
  newTable?: { tableId?: string; [key: string]: any };
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
}

/** Root context of the top-level poker workflow: union of all flow contexts. */
export interface PokerWorkflowContext
  extends PokerLobbyContext,
  PokerTurnContext {
  [key: string]: any;
}

/**
 * Conversation state (event-sourced). The lifecycle keys below are projected into the table's
 * PokerTableShape triples by `pokerTableProjector`.
 */
export interface PokerWorkflowState {
  /** Written by every table reducer step (its output is appended to the state log). */
  gameState?: PokerGameState;
  /** The seat that has to decide next and its legal choices; null when nobody has to (written by the reducer). */
  turn?: PokerTurn | null;
  /** The events the last reducer step reported; the flow that ran it emits them as they are. */
  events?: PokerTableEvent[];
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
  /** Outcome of the submitted decision (ActionResolved payload). */
  turnResolution?: { seatId: string; accepted: boolean; reason?: string };
  /** Illegal intents sent back to the seat this turn. */
  turnRejections?: number;
  /** RESUME or EXIT while the table is paused. */
  resumeCmd?: { type: 'RESUME' | 'EXIT' } | string;
  seatedPlayers?: Array<{ id: string; name?: string; isHuman?: boolean }>;
  /** Written by the engine when the table workflow crashes. */
  lastFailure?: { requestId: number; nodeId: string | null; nodeType: string | null; reason: string; failedAt: string };
  handCount?: number;
  lastWinnerId?: string;
  /** The table-talk gate's memory (budget, cooldowns, the open cue), written by `poker_table_talk`. */
  talk?: TableTalkState;
  [key: string]: any;
}

export interface PokerWorkflowParams {
  tableId?: string;
  action?: PlayerAction;
  playerId?: string;
  amount?: number;
  [key: string]: any;
}

/**
 * Pre-typed workflow scope for Texas Hold'em (Pillar 5: Scoped Context & State Factory).
 * Binds `state`, `ctx`, `params`, `output`, `setState`, `ifElse`, `whileLoop`, `stateMachine`, and `assign`
 * to `PokerWorkflowState` and `PokerWorkflowContext` once for all poker workflows.
 */
export const pokerScope = createWorkflowScope<PokerWorkflowState, PokerWorkflowContext, PokerWorkflowParams>();

export const {
  state,
  ctx,
  params,
  output,
  setState,
  ifElse,
  whileLoop,
  stateMachine,
  assign,
} = pokerScope;

export const lobbyCtx: TypedPathProxy<PokerLobbyContext> = createContextProxy<PokerLobbyContext>('$context');
export const bankrollCtx: TypedPathProxy<PokerBankrollContext> = createContextProxy<PokerBankrollContext>('$context');
export const bootCtx: TypedPathProxy<PokerBootContext> = createContextProxy<PokerBootContext>('$context');
export const turnCtx: TypedPathProxy<PokerTurnContext> = createContextProxy<PokerTurnContext>('$context');
// Game and lifecycle state are read from the event-sourced conversation state, never from request-context copies
export const gameState: TypedPathProxy<PokerGameState> = state.gameState;
/** The seat an actor handler is playing (Bevy component of the acting entity). */
export const actor: TypedPathProxy<PlayerState> = createContextProxy<PlayerState>('$params.actor');
