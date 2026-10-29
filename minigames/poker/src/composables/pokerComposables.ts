import {
  CuratorBuilder,
  seq,
  setState,
  reduce,
  emitEvents,
  type CuratorAstNode,
  type CuratorToolNode,
} from '../curator.ts';
import { agent_decision } from '../workflows/agentTurn.ts';
import { ctx, gameState, state, params } from '../models/pokerContext.ts';
import { SessionExited } from '../models/pokerEvents.ts';
import type {
  PokerListTablesParams,
  PokerCreateTableParams,
  PokerGetBuyInOptionsParams,
  PokerDepositBuyInParams,
  PokerReloadBankrollParams,
  PokerCloseTableParams,
} from '../models/pokerContext.ts';
import {
  PokerEvent,
  PokerModule,
  PokerStep,
  PokerTool,
  PokerReducer,
  PokerSessionReason,
  PokerActionType,
} from '../models/pokerContracts.ts';
import { PokerTableCommand } from '../engine/pokerTable.ts';

/**
 * Tool composable options: `as` names the context key the tool result is bound to.
 * A bound result does not also spread its fields into context/state unless `spread: true` is passed.
 */
export interface PokerToolOptions {
  as?: unknown;
  spread?: boolean;
}

const bindResult = (opts: PokerToolOptions): [unknown, { spread?: boolean }] =>
  [opts.as, { spread: opts.spread ?? !opts.as }];

/**
 * High-level readable predicates for poker game loops and transitions.
 * Built with typed path proxies to eliminate fragile literal strings.
 */
export const pokerPredicates = {
  is_game_active: `not ${state.sessionEnded} and not ${state.gameState.gameOver}`,
  table_needs_players: `not ${state.gameState} or ${state.gameState.players.length} < 2`,
};

/**
 * One table step: the table reducer (engine/pokerTable.ts) applies `command` to the live game state, its
 * `gameState`, `turn` and `events` land in `$state`, and the events it reports are emitted as they are.
 */
const table = (command: Record<string, unknown>): CuratorAstNode[] => [
  reduce(PokerReducer.TABLE, { state: String(gameState), command }),
  emitEvents(state.events),
];

/**
 * Declarative domain-specific poker composables that automatically bind table state
 * and prevent repetitive string plumbing.
 */
export const pokerComposables = {
  ctx,
  gameState,
  state,
  params,
  ...pokerPredicates,

  table,

  /** Seats the table from the run's table config (handed over through `$state.tableConfig`). */
  boot_table: (): CuratorAstNode[] =>
    table({
      type: PokerTableCommand.BOOT,
      config: {
        tableId: `${state.tableConfig.tableId} || 'poker:high_roller_lounge'`,
        startingChips: `${state.tableConfig.startingChips} || 1000`,
        sbAmount: `${state.tableConfig.sbAmount} || 10`,
        bbAmount: `${state.tableConfig.bbAmount} || 20`,
        maxSeats: `${state.tableConfig.maxSeats} || 6`,
        players: String(state.tableConfig.players),
        playerName: `${state.tableConfig.playerName} || 'You'`,
      },
    }),

  join_table: (player: unknown = ctx.joinRequest): CuratorAstNode[] =>
    table({ type: PokerTableCommand.JOIN, player: String(player) }),

  /** Starts a hand unless one is already running. */
  start_hand: (): CuratorAstNode[] =>
    table({ type: PokerTableCommand.START }),

  /** Applies a seat's action; the table then deals, settles and starts hands until a seat has to decide. */
  act: (action: unknown): CuratorAstNode[] =>
    table({ type: PokerTableCommand.ACT, action: String(action) }),

  agent_decision,

  list_tables: (args: Partial<PokerListTablesParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.LIST_TABLES, args, ...bindResult(opts)),

  create_table: (args: Partial<PokerCreateTableParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.CREATE_TABLE, args, ...bindResult(opts)),

  get_buy_in_options: (args: Partial<PokerGetBuyInOptionsParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.GET_BUY_IN_OPTIONS, args, ...bindResult(opts)),

  deposit_buy_in: (args: Partial<PokerDepositBuyInParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.DEPOSIT_BUY_IN, args, ...bindResult(opts)),

  reload_bankroll: (args: Partial<PokerReloadBankrollParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.RELOAD_BANKROLL, args, ...bindResult(opts)),

  close_table: (args: Partial<PokerCloseTableParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.CLOSE_TABLE, args, ...bindResult(opts)),

  /** Leaving is an announcement; the `close_on_exit` rule (tableRules) closes the conversation. */
  handle_user_exit: () =>
    seq(PokerStep.HANDLE_EXIT, [
      setState({ sessionEnded: true, isPaused: false }),
      SessionExited.emit({ reason: PokerSessionReason.USER_EXIT }),
    ]),

  // Typed Poker Domain Constants
  events: PokerEvent,
  modules: PokerModule,
  steps: PokerStep,
  tools: PokerTool,
  reasons: PokerSessionReason,
  actionTypes: PokerActionType,
};
