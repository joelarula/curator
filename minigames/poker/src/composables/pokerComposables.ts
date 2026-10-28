import {
  CuratorBuilder,
  seq,
  setState,
  type CuratorToolNode,
} from '../curator.ts';
import { agent_decision, ai_decision } from '../workflows/agentTurn.ts';
import { ctx, gameState, state, params } from '../models/pokerContext.ts';
import { SessionExited } from '../models/pokerEvents.ts';
import type {
  PokerStartHandParams,
  PokerDealStreetParams,
  PokerDistributePotsParams,
  PokerFastForwardParams,
  PokerApplyActionParams,
  PokerGetChoicesParams,
  PokerGetStandingsParams,
  PokerCheckGameOverParams,
  PokerRotateDealerParams,
  PokerInitLobbyParams,
  PokerListTablesParams,
  PokerLobbyMenuParams,
  PokerCreateTableParams,
  PokerJoinLobbyParams,
  PokerLeaveLobbyParams,
  PokerHumanSpeechParams,
  PokerGetBankrollParams,
  PokerGetBuyInOptionsParams,
  PokerDepositBuyInParams,
  PokerCashOutParams,
  PokerReloadBankrollParams,
  PokerCloseTableParams,
} from '../models/pokerContext.ts';
import {
  PokerEvent,
  PokerModule,
  PokerStep,
  PokerTool,
  PokerSessionReason,
  PokerActionType,
} from '../models/pokerContracts.ts';

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
  is_hand_active: `${state.gameState} and not ${state.gameState.handOver} and ${state.gameState.currentStreet} != "SHOWDOWN"`,
  is_street_active: `${state.gameState} and not ${state.gameState.streetComplete} and not ${state.gameState.handOver}`,
  active_player_is_human: `${state.gameState.players}[${state.gameState.activePlayerIdx}].isHuman`,
  active_player_is_interactive: `${state.gameState.players}[${state.gameState.activePlayerIdx}].isHuman or ${state.gameState.players}[${state.gameState.activePlayerIdx}].isInteractive`,
  has_table_players: `${state.gameState} and ${state.gameState.players.length} >= 2`,
  is_table_paused: `${state.isPaused} and not ${state.sessionEnded}`,
  table_has_no_state: `not ${state.gameState}`,
  table_needs_players: `not ${state.gameState} or ${state.gameState.players.length} < 2`,
  is_session_active: `not ${state.sessionEnded}`,
  is_session_unpaused: `not ${state.sessionEnded} and not ${state.isPaused}`,
  is_turn_action_pause: `(${ctx.turnAction} && ${ctx.turnAction}.type == '${PokerActionType.PAUSE}') || (${ctx.humanAction} && ${ctx.humanAction}.type == '${PokerActionType.PAUSE}')`,
  is_turn_action_exit: `(${ctx.turnAction} && ${ctx.turnAction}.type == '${PokerActionType.EXIT}') || (${ctx.humanAction} && ${ctx.humanAction}.type == '${PokerActionType.EXIT}')`,
  is_human_action_pause: `${ctx.humanAction} && ${ctx.humanAction}.type == '${PokerActionType.PAUSE}'`,
  is_human_action_exit: `${ctx.humanAction} && ${ctx.humanAction}.type == '${PokerActionType.EXIT}'`,
  is_resume_cmd: `(${ctx.resumeCmd} && ${ctx.resumeCmd}.type == '${PokerActionType.RESUME}') || ${ctx.resumeCmd} == '${PokerActionType.RESUME}'`,
  is_exit_cmd: `(${ctx.resumeCmd} && ${ctx.resumeCmd}.type == '${PokerActionType.EXIT}') || ${ctx.resumeCmd} == '${PokerActionType.EXIT}'`,
};

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

  // Tool composables with automated state injection and type-safe tool parameter models
  start_poker_hand: (args: Partial<PokerStartHandParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.START_HAND, { state: String(gameState), ...args }, ...bindResult(opts)),

  deal_next_street: (args: Partial<PokerDealStreetParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.DEAL_STREET, { state: String(gameState), ...args }, ...bindResult(opts)),

  settle_showdown: (args: Partial<PokerDistributePotsParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.DISTRIBUTE_POTS, { state: String(gameState), ...args }, ...bindResult(opts)),

  fast_forward_board: (args: Partial<PokerFastForwardParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.FAST_FORWARD, { state: String(gameState), ...args }, ...bindResult(opts)),

  apply_player_action: (action?: any, args: Partial<PokerApplyActionParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.APPLY_ACTION, {
      state: String(gameState),
      action: String(action ?? `${ctx.turnAction} || ${ctx.humanAction} || ${ctx.decision.action} || ${ctx.action}`),
      ...args,
    }, ...bindResult(opts)),

  get_legal_choices: (args: Partial<PokerGetChoicesParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.GET_CHOICES, {
      state: String(gameState),
      playerIdx: String(gameState.activePlayerIdx),
      ...args,
    }, ...bindResult(opts)),

  get_standings: (args: Partial<PokerGetStandingsParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.GET_STANDINGS, { state: String(gameState), ...args }, ...bindResult(opts)),

  check_game_over: (args: Partial<PokerCheckGameOverParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.CHECK_GAME_OVER, { state: String(gameState), ...args }, ...bindResult(opts)),

  rotate_dealer: (args: Partial<PokerRotateDealerParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.ROTATE_DEALER, { state: String(gameState), ...args }, ...bindResult(opts)),

  agent_decision,

  ai_decision,

  boot_table: (args: Partial<PokerInitLobbyParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.INIT_LOBBY, {
      tableId: `${state.tableConfig.tableId} || 'poker:high_roller_lounge'`,
      startingChips: `${state.tableConfig.startingChips} || 1000`,
      sbAmount: `${state.tableConfig.sbAmount} || 10`,
      bbAmount: `${state.tableConfig.bbAmount} || 20`,
      maxSeats: `${state.tableConfig.maxSeats} || 6`,
      players: String(state.tableConfig.players),
      playerName: `${state.tableConfig.playerName} || 'You'`,
      ...args,
    }, ...bindResult(opts)),

  list_tables: (args: Partial<PokerListTablesParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.LIST_TABLES, args, ...bindResult(opts)),

  lobby_menu: (args: Partial<PokerLobbyMenuParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.LOBBY_MENU, args, ...bindResult(opts)),

  create_table: (args: Partial<PokerCreateTableParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.CREATE_TABLE, args, ...bindResult(opts)),

  join_lobby: (player: any = ctx.joinRequest, args: Partial<PokerJoinLobbyParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.JOIN_LOBBY, { player: String(player), ...args }, ...bindResult(opts)),

  leave_lobby: (id: string, args: Partial<PokerLeaveLobbyParams> = { id }, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.LEAVE_LOBBY, { id: String(id), ...args }, ...bindResult(opts)),

  human_speech: (args: PokerHumanSpeechParams, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.HUMAN_SPEECH, args, ...bindResult(opts)),

  get_bankroll: (opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.GET_BANKROLL, {}, ...bindResult(opts)),

  get_buy_in_options: (args: Partial<PokerGetBuyInOptionsParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.GET_BUY_IN_OPTIONS, args, ...bindResult(opts)),

  deposit_buy_in: (args: Partial<PokerDepositBuyInParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.DEPOSIT_BUY_IN, args, ...bindResult(opts)),

  cash_out: (args: Partial<PokerCashOutParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.CASH_OUT, args, ...bindResult(opts)),

  reload_bankroll: (args: Partial<PokerReloadBankrollParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.RELOAD_BANKROLL, args, ...bindResult(opts)),

  close_table: (args: Partial<PokerCloseTableParams> = {}, opts: PokerToolOptions = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.CLOSE_TABLE, args, ...bindResult(opts)),

  handle_user_exit: () =>
    seq(PokerStep.HANDLE_EXIT, [
      setState({ sessionEnded: true, isPaused: false }),
      // Announce before closing: a closed conversation no longer logs events
      SessionExited.emit({ reason: PokerSessionReason.USER_EXIT }),
      CuratorBuilder.tool(PokerTool.CLOSE_TABLE, { reason: PokerSessionReason.USER_EXIT }),
    ]),

  // Typed Poker Domain Constants
  events: PokerEvent,
  modules: PokerModule,
  steps: PokerStep,
  tools: PokerTool,
  reasons: PokerSessionReason,
  actionTypes: PokerActionType,
};

/**
 * Domain composable returning typed proxies and models for poker workflows.
 */
export function usePokerContext() {
  return {
    ctx,
    gameState,
    state,
    params,
    events: PokerEvent,
    tools: PokerTool,
    steps: PokerStep,
    modules: PokerModule,
    reasons: PokerSessionReason,
    actions: PokerActionType,
    predicates: pokerPredicates,
  };
}



