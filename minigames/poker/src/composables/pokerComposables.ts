import {
  CuratorBuilder,
  createContextProxy,
  type TypedPathProxy,
  type CuratorToolNode,
} from '../curator.ts';
import type { PokerWorkflowContext, PokerWorkflowState, PokerWorkflowParams } from '../models/pokerContext.ts';
import { PokerEvent, type PokerEventType } from '../models/pokerEvents.ts';
import {
  PokerModule,
  type PokerModuleType,
  PokerSubroutine,
  type PokerSubroutineType,
  PokerStep,
  type PokerStepType,
} from '../models/pokerSteps.ts';
import { PokerTool, type PokerToolType } from '../models/pokerTools.ts';
import {
  PokerSessionReason,
  type PokerSessionReasonType,
  PokerActionType,
  type PokerActionTypeValue,
} from '../models/pokerConstants.ts';
export * from '../models/pokerRoles.ts';
import type { PokerGameState } from '../types.ts';

export {
  PokerEvent,
  type PokerEventType,
  PokerModule,
  type PokerModuleType,
  PokerSubroutine,
  type PokerSubroutineType,
  PokerStep,
  type PokerStepType,
  PokerTool,
  type PokerToolType,
  PokerSessionReason,
  type PokerSessionReasonType,
  PokerActionType,
  type PokerActionTypeValue,
  createContextProxy,
  type TypedPathProxy,
};

export const ctx: TypedPathProxy<PokerWorkflowContext> = createContextProxy<PokerWorkflowContext>('$context');
export const gameState: TypedPathProxy<PokerGameState> = createContextProxy<PokerGameState>('$context.gameState');
export const state: TypedPathProxy<PokerWorkflowState> = createContextProxy<PokerWorkflowState>('$state');
export const params: TypedPathProxy<PokerWorkflowParams> = createContextProxy<PokerWorkflowParams>('$params');

/**
 * High-level readable predicates for poker game loops and transitions.
 * Built with typed path proxies to eliminate fragile literal strings.
 */
export const pokerPredicates = {
  is_game_active: `not ${ctx.sessionEnded} and not ${ctx.gameState.gameOver}`,
  is_hand_active: `${ctx.gameState} and not ${ctx.gameState.handOver} and ${ctx.gameState.currentStreet} != "SHOWDOWN"`,
  is_street_active: `${ctx.gameState} and not ${ctx.gameState.streetComplete} and not ${ctx.gameState.handOver}`,
  active_player_is_human: `${ctx.gameState.players}[${ctx.gameState.activePlayerIdx}].isHuman`,
  has_table_players: `${ctx.gameState} and ${ctx.gameState.players.length} >= 2`,
  is_table_paused: `${ctx.isPaused} and not ${ctx.sessionEnded}`,
  table_has_no_state: `not ${ctx.gameState}`,
  table_needs_players: `not ${ctx.gameState} or ${ctx.gameState.players.length} < 2`,
  is_session_active: `not ${ctx.sessionEnded}`,
  is_session_unpaused: `not ${ctx.sessionEnded} and not ${ctx.isPaused}`,
  is_human_action_pause: `${ctx.humanAction.type} == '${PokerActionType.PAUSE}'`,
  is_human_action_exit: `${ctx.humanAction.type} == '${PokerActionType.EXIT}'`,
  is_resume_cmd: `${ctx.resumeCmd.type} == '${PokerActionType.RESUME}' or ${ctx.resumeCmd} == '${PokerActionType.RESUME}'`,
  is_exit_cmd: `${ctx.resumeCmd.type} == '${PokerActionType.EXIT}' or ${ctx.resumeCmd} == '${PokerActionType.EXIT}'`,
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

  // Tool composables with automated state injection and type-safe tool names
  start_poker_hand: (args: Record<string, any> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.START_HAND, { state: String(gameState), ...args }),

  deal_next_street: (args: Record<string, any> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.DEAL_STREET, { state: String(gameState), ...args }),

  settle_showdown: (args: Record<string, any> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.DISTRIBUTE_POTS, { state: String(gameState), ...args }),

  apply_player_action: (action?: any, args: Record<string, any> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.APPLY_ACTION, {
      state: String(gameState),
      action: String(action ?? `${ctx.humanAction} || ${ctx.poker_ai_decision.action} || ${ctx.action}`),
      ...args,
    }),

  get_legal_choices: (args: Record<string, any> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.GET_CHOICES, {
      state: String(gameState),
      playerIdx: String(gameState.activePlayerIdx),
      ...args,
    }),

  check_game_over: (args: Record<string, any> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.CHECK_GAME_OVER, { state: String(gameState), ...args }),

  rotate_dealer: (args: Record<string, any> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.ROTATE_DEALER, { state: String(gameState), ...args }),

  ai_decision: (args: Record<string, any> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.AI_DECISION, {
      state: String(gameState),
      ...args,
    }),

  boot_table: (args: Record<string, any> = {}): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.INIT_LOBBY, {
      tableId: `${ctx.tableId} || 'poker:high_roller_lounge'`,
      startingChips: `${ctx.startingChips} || 1000`,
      sbAmount: `${ctx.sbAmount} || 10`,
      bbAmount: `${ctx.bbAmount} || 20`,
      maxSeats: `${ctx.maxSeats} || 6`,
      players: String(ctx.players),
      ...args,
    }),

  list_tables: (): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.LIST_TABLES),

  join_lobby: (player: any = ctx.joinRequest): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.JOIN_LOBBY, { player: String(player) }),

  human_speech: (args: Record<string, any>): CuratorToolNode =>
    CuratorBuilder.tool(PokerTool.HUMAN_SPEECH, args),

  // Typed Poker Domain Constants
  events: PokerEvent,
  modules: PokerModule,
  subroutines: PokerSubroutine,
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
    subroutines: PokerSubroutine,
    reasons: PokerSessionReason,
    actions: PokerActionType,
    predicates: pokerPredicates,
  };
}



