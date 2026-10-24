/**
 * Poker Tool Definitions & Type-Safe Identifiers
 * Eliminates string literals for tool invocations and registrations.
 */

export const PokerTool = {
  INIT_LOBBY: 'poker_init_lobby',
  JOIN_LOBBY: 'poker_join_lobby',
  LEAVE_LOBBY: 'poker_leave_lobby',
  START_HAND: 'poker_start_hand',
  DEAL_STREET: 'poker_deal_street',
  DISTRIBUTE_POTS: 'poker_distribute_pots',
  APPLY_ACTION: 'poker_apply_action',
  GET_CHOICES: 'poker_get_choices',
  CHECK_GAME_OVER: 'poker_check_game_over',
  ROTATE_DEALER: 'poker_rotate_dealer',
  AI_DECISION: 'poker_ai_decision',
  LIST_TABLES: 'poker_list_tables',
  HUMAN_SPEECH: 'poker_human_speech',
  FAST_FORWARD: 'poker_fast_forward_board',
  GET_STANDINGS: 'poker_get_standings',
} as const;

export type PokerToolType = (typeof PokerTool)[keyof typeof PokerTool];

export const PokerToolAlias = {
  ACT: 'act',
  SPEECH: 'speech',
  STANDINGS: 'standings_tool',
  LIST_TABLES: 'list_tables',
} as const;

export type PokerToolAliasType = (typeof PokerToolAlias)[keyof typeof PokerToolAlias];

export const PokerToolUsage = {
  JOIN_LOBBY: '<actorId> <name> [chips] [seatIdx]',
  LEAVE_LOBBY: '<actorId>',
  APPLY_ACTION: '<actionType> [amount]',
  HUMAN_SPEECH: '<speak|whisper|message> [actor] <text>',
  GET_CHOICES: '[playerIdx]',
} as const;

export type PokerToolUsageType = (typeof PokerToolUsage)[keyof typeof PokerToolUsage];

export function isPokerTool(value: unknown): value is PokerToolType {
  return typeof value === 'string' && Object.values(PokerTool).includes(value as PokerToolType);
}
