import {
  seq,
  emitEvents,
  type CuratorAstNode,
  type CuratorExpr,
  type CuratorToolCallOptions,
} from '../curator.ts';
import type { PlayerAction, PlayerJoinOptions } from '../types.ts';
import { agent_decision } from '../workflows/agentTurn.ts';
import { ctx, gameState, state, params, setState } from '../models/pokerContext.ts';
import { SessionExited } from '../models/pokerEvents.ts';
import {
  PokerEvent,
  PokerModule,
  PokerStep,
  PokerTool,
  PokerSessionReason,
  PokerActionType,
} from '../models/pokerContracts.ts';
import { PokerTableCommand, type PokerTableCommandInput } from '../engine/pokerTable.ts';
import { pokerConfig, tableSettings, setting, DEFAULT_TABLE_SETTINGS } from '../pokerConfig.ts';
import {
  pokerTableReducer,
  pokerGetStandingsTool,
  pokerListTablesTool,
  pokerCreateTableTool,
  pokerGetBankrollTool,
  pokerGetBuyInOptionsTool,
  pokerDepositBuyInTool,
  pokerCashOutTool,
  pokerReloadBankrollTool,
  pokerCloseTableTool,
} from '../plugins/pokerTools.ts';

export type PokerToolOptions = CuratorToolCallOptions;

/**
 * High-level readable predicates for poker game loops and transitions.
 * Built with fluent typed path proxies (Pillar 1) to eliminate fragile literal strings.
 */
export const pokerPredicates = {
  is_game_active: state.sessionEnded.not().and(state.gameState.gameOver.not()),
  table_needs_players: state.gameState.not().or(state.gameState.players.length.lt(2)),
};

/**
 * One table step: the first-class `pokerTableReducer` (Pillar 2) applies `command` to the live game state,
 * its `gameState`, `turn` and `events` land in `$state`, and the events it reports are emitted as they are.
 */
const table = (command: CuratorExpr<PokerTableCommandInput>): CuratorAstNode[] => [
  pokerTableReducer.reduce({ state: gameState, command }),
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

  /**
   * Seats the table from the run's table config (handed over through `$state.tableConfig`). The table first
   * keeps a copy of `$config.poker` as `$state.tableSettings`, so it plays on with the settings it booted
   * with; values the run does not set come from its `table` section.
   */
  boot_table: (): CuratorAstNode[] => [
    setState({ tableSettings: pokerConfig }),
    ...table({
      type: PokerTableCommand.BOOT,
      config: {
        tableId: state.tableConfig.tableId.orDefault('poker:high_roller_lounge'),
        startingChips: state.tableConfig.startingChips.orDefault(setting(tableSettings.table.startingChips, DEFAULT_TABLE_SETTINGS.startingChips)),
        sbAmount: state.tableConfig.sbAmount.orDefault(setting(tableSettings.table.smallBlind, DEFAULT_TABLE_SETTINGS.smallBlind)),
        bbAmount: state.tableConfig.bbAmount.orDefault(setting(tableSettings.table.bigBlind, DEFAULT_TABLE_SETTINGS.bigBlind)),
        maxSeats: state.tableConfig.maxSeats.orDefault(setting(tableSettings.table.maxSeats, DEFAULT_TABLE_SETTINGS.maxSeats)),
        players: state.tableConfig.players,
        playerName: state.tableConfig.playerName.orDefault('You'),
      },
    }),
  ],

  join_table: (player: CuratorExpr<PlayerJoinOptions> = ctx.joinRequest): CuratorAstNode[] =>
    table({ type: PokerTableCommand.JOIN, player }),

  /** Starts a hand unless one is already running. */
  start_hand: (): CuratorAstNode[] =>
    table({ type: PokerTableCommand.START }),

  /** Applies a seat's action; the table then deals, settles and starts hands until a seat has to decide. */
  act: (action: CuratorExpr<PlayerAction>): CuratorAstNode[] =>
    table({ type: PokerTableCommand.ACT, action }),

  agent_decision,

  // First-class callable tools (Pillar 2): `defineTool` instances are directly callable to build `Curator_Tool` nodes
  get_standings: pokerGetStandingsTool,
  list_tables: pokerListTablesTool,
  create_table: pokerCreateTableTool,
  get_bankroll: pokerGetBankrollTool,
  get_buy_in_options: pokerGetBuyInOptionsTool,
  deposit_buy_in: pokerDepositBuyInTool,
  cash_out: pokerCashOutTool,
  reload_bankroll: pokerReloadBankrollTool,
  close_table: pokerCloseTableTool,

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
