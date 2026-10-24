import type { CuratorToolNode } from '../curator.ts';
import type { PokerWorkflowContext, PokerWorkflowState, PokerWorkflowParams } from '../models/pokerContext.ts';
import type { PokerGameState } from '../types.ts';

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
  is_human_action_pause: `${ctx.humanAction.type} == 'PAUSE'`,
  is_human_action_exit: `${ctx.humanAction.type} == 'EXIT'`,
  is_resume_cmd: `${ctx.resumeCmd.type} == 'RESUME' or ${ctx.resumeCmd} == 'RESUME'`,
  is_exit_cmd: `${ctx.resumeCmd.type} == 'EXIT' or ${ctx.resumeCmd} == 'EXIT'`,
  is_lobby_exit: `${ctx.lobbyChoice.id} == 'exit' or ${ctx.lobbyChoice} == 'exit'`,
  is_lobby_resume: `${ctx.lobbyChoice.id} == 'resume' or ${ctx.lobbyChoice} == 'resume'`,
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

  // Tool composables with automated state injection
  start_poker_hand: (args: Record<string, any> = {}): CuratorToolNode => ({
    type: 'Curator_Tool',
    toolName: 'poker_start_hand',
    args: { state: String(gameState), ...args },
  }),

  deal_next_street: (args: Record<string, any> = {}): CuratorToolNode => ({
    type: 'Curator_Tool',
    toolName: 'poker_deal_street',
    args: { state: String(gameState), ...args },
  }),

  settle_showdown: (args: Record<string, any> = {}): CuratorToolNode => ({
    type: 'Curator_Tool',
    toolName: 'poker_distribute_pots',
    args: { state: String(gameState), ...args },
  }),

  apply_player_action: (action?: any, args: Record<string, any> = {}): CuratorToolNode => ({
    type: 'Curator_Tool',
    toolName: 'poker_apply_action',
    args: {
      state: String(gameState),
      action: String(action ?? `${ctx.humanAction} || ${ctx.poker_ai_decision.action} || ${ctx.action}`),
      ...args,
    },
  }),

  get_legal_choices: (args: Record<string, any> = {}): CuratorToolNode => ({
    type: 'Curator_Tool',
    toolName: 'poker_get_choices',
    args: {
      state: String(gameState),
      playerIdx: String(gameState.activePlayerIdx),
      ...args,
    },
  }),

  check_game_over: (args: Record<string, any> = {}): CuratorToolNode => ({
    type: 'Curator_Tool',
    toolName: 'poker_check_game_over',
    args: { state: String(gameState), ...args },
  }),

  rotate_dealer: (args: Record<string, any> = {}): CuratorToolNode => ({
    type: 'Curator_Tool',
    toolName: 'poker_rotate_dealer',
    args: { state: String(gameState), ...args },
  }),

  ai_decision: (args: Record<string, any> = {}): CuratorToolNode => ({
    type: 'Curator_Tool',
    toolName: 'poker_ai_decision',
    args: {
      state: String(gameState),
      ...args,
    },
  }),

  boot_table: (args: Record<string, any> = {}): CuratorToolNode => ({
    type: 'Curator_Tool',
    toolName: 'poker_init_lobby',
    args: {
      tableId: `${ctx.tableId} || 'poker:high_roller_lounge'`,
      startingChips: `${ctx.startingChips} || 1000`,
      sbAmount: `${ctx.sbAmount} || 10`,
      bbAmount: `${ctx.bbAmount} || 20`,
      maxSeats: `${ctx.maxSeats} || 6`,
      players: String(ctx.players),
      ...args,
    },
  }),

  list_tables: (): CuratorToolNode => ({
    type: 'Curator_Tool',
    toolName: 'poker_list_tables',
  }),

  join_lobby: (player: any = ctx.joinRequest): CuratorToolNode => ({
    type: 'Curator_Tool',
    toolName: 'poker_join_lobby',
    args: { player: String(player) },
  }),

  human_speech: (args: Record<string, any>): CuratorToolNode => ({
    type: 'Curator_Tool',
    toolName: 'poker_human_speech',
    args,
  }),
};
