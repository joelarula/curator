import {
  CuratorBuilder,
  createContextProxy,
  seq,
  setState,
  emitEvent,
  type TypedPathProxy,
  type CuratorToolNode,
  type CuratorAgentNode,
} from '../curator.ts';

import {
  POKER_DECISION_OUTPUT_SCHEMA,
  POKER_AGENT_INSTRUCTION,
  type PokerAgentDecisionOptions,
  agent_decision,
  ai_decision,
} from '../workflows/agentTurn.ts';

export {
  POKER_DECISION_OUTPUT_SCHEMA,
  POKER_AGENT_INSTRUCTION,
  type PokerAgentDecisionOptions,
  agent_decision,
  ai_decision,
};

import { ctx, gameState, state, params } from '../models/pokerContext.ts';
export { ctx, gameState, state, params };

import type {
  PokerWorkflowContext,
  PokerWorkflowState,
  PokerWorkflowParams,
  PokerInitLobbyParams,
  PokerJoinLobbyParams,
  PokerLeaveLobbyParams,
  PokerStartHandParams,
  PokerAiDecisionParams,
  PokerApplyActionParams,
  PokerDealStreetParams,
  PokerFastForwardParams,
  PokerDistributePotsParams,
  PokerRotateDealerParams,
  PokerHumanSpeechParams,
  PokerCheckGameOverParams,
  PokerGetStandingsParams,
  PokerGetChoicesParams,
  PokerListTablesParams,
  PokerCreateTableParams,
  PokerGetBankrollParams,
  PokerDepositBuyInParams,
  PokerCashOutParams,
  PokerReloadBankrollParams,
  PokerToolParamsMap,
} from '../models/pokerContext.ts';
import {
  PokerRole,
  PokerEvent,
  type PokerEventType,
  PokerModule,
  type PokerModuleType,
  PokerStep,
  type PokerStepType,
  PokerTool,
  type PokerToolType,
  PokerToolAlias,
  type PokerToolAliasType,
  PokerToolUsage,
  type PokerToolUsageType,
  PokerSessionReason,
  type PokerSessionReasonType,
  PokerActionType,
  type PokerActionTypeValue,
  PokerStreet,
  type PokerStreetType,
} from '../models/pokerContracts.ts';

export { PokerRole };
export type {
  PokerInitLobbyParams,
  PokerJoinLobbyParams,
  PokerLeaveLobbyParams,
  PokerStartHandParams,
  PokerAiDecisionParams,
  PokerApplyActionParams,
  PokerDealStreetParams,
  PokerFastForwardParams,
  PokerDistributePotsParams,
  PokerRotateDealerParams,
  PokerHumanSpeechParams,
  PokerCheckGameOverParams,
  PokerGetStandingsParams,
  PokerGetChoicesParams,
  PokerListTablesParams,
  PokerCreateTableParams,
  PokerGetBankrollParams,
  PokerDepositBuyInParams,
  PokerCashOutParams,
  PokerReloadBankrollParams,
  PokerToolParamsMap,
};
import type { PokerGameState } from '../types.ts';

export {
  PokerEvent,
  type PokerEventType,
  PokerModule,
  type PokerModuleType,
  PokerStep,
  type PokerStepType,
  PokerTool,
  type PokerToolType,
  PokerToolAlias,
  type PokerToolAliasType,
  PokerToolUsage,
  type PokerToolUsageType,
  PokerSessionReason,
  type PokerSessionReasonType,
  PokerActionType,
  type PokerActionTypeValue,
  PokerStreet,
  type PokerStreetType,
  createContextProxy,
  type TypedPathProxy,
};

/**
 * High-level readable predicates for poker game loops and transitions.
 * Built with typed path proxies to eliminate fragile literal strings.
 */
export const pokerPredicates = {
  is_game_active: `not ${ctx.sessionEnded} and not ${ctx.gameState.gameOver}`,
  is_hand_active: `${ctx.gameState} and not ${ctx.gameState.handOver} and ${ctx.gameState.currentStreet} != "SHOWDOWN"`,
  is_street_active: `${ctx.gameState} and not ${ctx.gameState.streetComplete} and not ${ctx.gameState.handOver}`,
  active_player_is_human: `${ctx.gameState.players}[${ctx.gameState.activePlayerIdx}].isHuman`,
  active_player_is_interactive: `${ctx.gameState.players}[${ctx.gameState.activePlayerIdx}].isHuman or ${ctx.gameState.players}[${ctx.gameState.activePlayerIdx}].isInteractive`,
  has_table_players: `${ctx.gameState} and ${ctx.gameState.players.length} >= 2`,
  is_table_paused: `${ctx.isPaused} and not ${ctx.sessionEnded}`,
  table_has_no_state: `not ${ctx.gameState}`,
  table_needs_players: `not ${ctx.gameState} or ${ctx.gameState.players.length} < 2`,
  is_session_active: `not ${ctx.sessionEnded}`,
  is_session_unpaused: `not ${ctx.sessionEnded} and not ${ctx.isPaused}`,
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
  start_poker_hand: (args: Partial<PokerStartHandParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.START_HAND, { state: String(gameState), ...args }),

  deal_next_street: (args: Partial<PokerDealStreetParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.DEAL_STREET, { state: String(gameState), ...args }),

  settle_showdown: (args: Partial<PokerDistributePotsParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.DISTRIBUTE_POTS, { state: String(gameState), ...args }),

  fast_forward_board: (args: Partial<PokerFastForwardParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.FAST_FORWARD, { state: String(gameState), ...args }),

  apply_player_action: (action?: any, args: Partial<PokerApplyActionParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.APPLY_ACTION, {
      state: String(gameState),
      action: String(action ?? `${ctx.turnAction} || ${ctx.humanAction} || ${ctx.poker_ai_decision.action} || ${ctx.action}`),
      ...args,
    }),

  get_legal_choices: (args: Partial<PokerGetChoicesParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.GET_CHOICES, {
      state: String(gameState),
      playerIdx: String(gameState.activePlayerIdx),
      ...args,
    }),

  get_standings: (args: Partial<PokerGetStandingsParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.GET_STANDINGS, { state: String(gameState), ...args }),

  check_game_over: (args: Partial<PokerCheckGameOverParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.CHECK_GAME_OVER, { state: String(gameState), ...args }),

  rotate_dealer: (args: Partial<PokerRotateDealerParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.ROTATE_DEALER, { state: String(gameState), ...args }),

  agent_decision,

  ai_decision,

  boot_table: (args: Partial<PokerInitLobbyParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.INIT_LOBBY, {
      tableId: `${ctx.tableId} || 'poker:high_roller_lounge'`,
      startingChips: `${ctx.startingChips} || 1000`,
      sbAmount: `${ctx.sbAmount} || 10`,
      bbAmount: `${ctx.bbAmount} || 20`,
      maxSeats: `${ctx.maxSeats} || 6`,
      players: String(ctx.players),
      playerName: `${ctx.playerName} || 'You'`,
      ...args,
    }),

  list_tables: (args: Partial<PokerListTablesParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.LIST_TABLES, args),

  create_table: (args: Partial<PokerCreateTableParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.CREATE_TABLE, args),

  join_lobby: (player: any = ctx.joinRequest, args: Partial<PokerJoinLobbyParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.JOIN_LOBBY, { player: String(player), ...args }),

  leave_lobby: (id: string, args: Partial<PokerLeaveLobbyParams> = { id }): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.LEAVE_LOBBY, { id: String(id), ...args }),

  human_speech: (args: PokerHumanSpeechParams): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.HUMAN_SPEECH, args),

  get_bankroll: (args: Partial<PokerGetBankrollParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.GET_BANKROLL, args),

  deposit_buy_in: (args: Partial<PokerDepositBuyInParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.DEPOSIT_BUY_IN, args),

  cash_out: (args: Partial<PokerCashOutParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.CASH_OUT, args),

  reload_bankroll: (args: Partial<PokerReloadBankrollParams> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.RELOAD_BANKROLL, args),

  handle_user_exit: () =>
    seq(PokerStep.HANDLE_EXIT, [
      setState({ sessionEnded: true }),
      emitEvent(PokerEvent.SESSION_EXITED, {
        reason: PokerSessionReason.USER_EXIT,
      }),
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



