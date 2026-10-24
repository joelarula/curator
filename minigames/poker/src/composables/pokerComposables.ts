import {
  CuratorBuilder,
  defineModule,
  defineSubroutine,
  onEvent,
  type TypedSubroutine,
  type CuratorToolNode,
  type CuratorSequentialNode,
  type CuratorModuleNode,
  type CuratorCallNode,
  type CuratorSubroutine,
  type CuratorParamSpec,
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
  PokerSpeechAct,
  type PokerSpeechActType,
  PokerLobbyAction,
  type PokerLobbyActionType,
  PokerActionType,
  type PokerActionTypeValue,
} from '../models/pokerConstants.ts';
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
  PokerSpeechAct,
  type PokerSpeechActType,
  PokerLobbyAction,
  type PokerLobbyActionType,
  PokerActionType,
  type PokerActionTypeValue,
};

/**
 * Recursive TypeScript proxy type that reflects the properties of model T
 * while resolving each property access to its runtime AST expression path string.
 */
export type TypedPathProxy<T> = (T extends (...args: any[]) => any
  ? (...args: Parameters<T>) => ReturnType<T>
  : T extends Array<infer U>
  ? { [index: number]: TypedPathProxy<U>; length: TypedPathProxy<number> } & {
      [K in keyof T]: TypedPathProxy<T[K]>;
    }
  : T extends object
  ? {
      [K in keyof T]-?: TypedPathProxy<NonNullable<T[K]>>;
    }
  : {}) & {
  (): string;
  toString(): string;
  valueOf(): string;
  toJSON(): string;
  [key: string]: any;
};

/**
 * Creates a typed recursive proxy that resolves property paths to AST expressions.
 * e.g. ctx.gameState.currentStreet => "$context.gameState.currentStreet"
 */
export function createContextProxy<T = any>(root = '$context'): TypedPathProxy<T> {
  const targetObj = {
    toJSON: () => root,
    toString: () => root,
    valueOf: () => root,
  };
  const handler: ProxyHandler<any> = {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return undefined;
      const strProp = String(prop);
      if (strProp === 'toString' || strProp === 'valueOf' || strProp === 'toJSON') {
        return () => root;
      }
      return createContextProxy(`${root}.${strProp}`);
    },
    apply() {
      return root;
    },
  };
  return new Proxy(targetObj, handler) as any;
}

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
  is_lobby_exit: `${ctx.lobbyChoice.id} == '${PokerLobbyAction.EXIT}' or ${ctx.lobbyChoice} == '${PokerLobbyAction.EXIT}'`,
  is_lobby_resume: `${ctx.lobbyChoice.id} == '${PokerLobbyAction.RESUME}' or ${ctx.lobbyChoice} == '${PokerLobbyAction.RESUME}'`,
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

  // Generic typed tool invocation
  tool: (
    toolName: PokerToolType | string,
    args?: Record<string, any>,
    as?: string
  ): CuratorToolNode => CuratorBuilder.tool(toolName, args, as),

  // Typed Poker Domain Constants
  events: PokerEvent,
  modules: PokerModule,
  subroutines: PokerSubroutine,
  steps: PokerStep,
  tools: PokerTool,
  reasons: PokerSessionReason,
  speechActs: PokerSpeechAct,
  lobbyActions: PokerLobbyAction,
  actionTypes: PokerActionType,

  // Literals-free AST Sequencer & Flow Builders
  seq: (nameOrFirstNode?: string | any, ...rest: any[]): CuratorSequentialNode => {
    if (typeof nameOrFirstNode === 'string') {
      return CuratorBuilder.seq(nameOrFirstNode, ...rest);
    }
    const allNodes = nameOrFirstNode !== undefined ? [nameOrFirstNode, ...rest] : rest;
    const rawList = allNodes.length === 1 && Array.isArray(allNodes[0]) ? allNodes[0] : allNodes.flat();
    const unwrapped = rawList.map((n: any) =>
      n && typeof n === 'object' && typeof n.build === 'function' ? n.build() : n
    );
    return { type: 'Curator_Sequential', subAgents: unwrapped };
  },

  defineModule: (
    name: PokerModuleType | string,
    setupOrOptions: any,
    maybeSetup?: any
  ): CuratorModuleNode => (CuratorBuilder.defineModule as any)(name, setupOrOptions, maybeSetup),

  defineSubroutine,

  sub: (
    params: Record<string, CuratorParamSpec> | undefined,
    body: any,
    returns?: string
  ): CuratorSubroutine => CuratorBuilder.sub(params, body, returns),

  call: (
    ref: PokerSubroutineType | TypedSubroutine | string,
    args?: Record<string, any>,
    options?: { as?: string; mode?: 'child' | 'inline' }
  ): CuratorCallNode => CuratorBuilder.call(ref, args, options),

  ifElse: (condition: any, thenBranch: any, elseBranch?: any) =>
    CuratorBuilder.ifElse(condition, thenBranch, elseBranch),

  whileLoop: (condition: any, body: any) =>
    CuratorBuilder.whileLoop(condition, body),

  setState: (state: Record<string, any>) =>
    CuratorBuilder.setState(state),

  choice: (
    prompt: string,
    choices?: any,
    options?: { as?: TypedPathProxy<any> | keyof PokerWorkflowContext | (string & {}); [key: string]: any }
  ) =>
    CuratorBuilder.choice(
      prompt,
      choices,
      options ? { ...options, as: toVarName(options.as) } : undefined
    ),

  // Typed Poker Event Composables
  emitEvent: (event: PokerEventType, payload?: Record<string, any>) =>
    CuratorBuilder.emitEvent(event, payload),
  waitEvent: (
    event: PokerEventType,
    asVariable?: TypedPathProxy<any> | keyof PokerWorkflowContext | (string & {}),
    options?: { timeoutSeconds?: number; replay?: boolean }
  ) => CuratorBuilder.waitEvent(event, toVarName(asVariable), options),
  subscribe: (
    event: PokerEventType,
    target: TypedSubroutine | PokerSubroutineType | string,
    options?: { as?: TypedPathProxy<any> | string; when?: string; scope?: 'conversation' | 'project' }
  ) => CuratorBuilder.subscribe(
    event,
    target,
    options ? { ...options, as: toVarName(options.as) } : undefined
  ),
  onEvent: (
    event: PokerEventType,
    handler: TypedSubroutine | PokerSubroutineType | string,
    options?: { as?: TypedPathProxy<any> | string; when?: string; scope?: 'conversation' | 'project' }
  ) => onEvent(
    event,
    handler,
    options ? { ...options, as: toVarName(options.as) } : undefined
  ),
};

export { defineModule, defineSubroutine, onEvent, type TypedSubroutine };

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
    speechActs: PokerSpeechAct,
    lobbyActions: PokerLobbyAction,
    actions: PokerActionType,
    predicates: pokerPredicates,
  };
}

/**
 * Extracts a bare variable name from a TypedPathProxy or string.
 * e.g. ctx.resumeCmd -> "resumeCmd", params.speechEvt -> "speechEvt"
 */
export function toVarName(target: unknown): string | undefined {
  if (target === undefined || target === null) return undefined;
  const str = String(target);
  return str.replace(/^\$(context|state|params)\./, '');
}


