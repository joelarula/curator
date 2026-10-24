/**
 * Poker Event Definitions & Type-Safe Identifiers
 * Eliminates string literals for event publication, subscriptions, and UI dispatches.
 */

export const PokerEvent = {
  // Lobby & Seating
  LOBBY_READY: 'poker:lobby_ready',
  AWAITING_PLAYERS: 'poker:awaiting_players',
  PLAYER_JOINED: 'poker:player_joined',
  TABLE_READY: 'poker:table_ready',

  // Hand & Street Lifecycle
  NEW_ROUND: 'poker:new_round',
  PHASE_DEAL: 'poker:phase_deal',
  PHASE_STREET: 'poker:phase_street',
  PHASE_SETTLE: 'poker:phase_settle',
  SHOWDOWN: 'poker:showdown',
  GAME_OVER: 'poker:game_over',

  // Session Control
  TABLE_PAUSED: 'poker:table_paused',
  RESUME_ACTION: 'poker:resume_action',
  TABLE_RESUMED: 'poker:table_resumed',
  SESSION_EXITED: 'poker:session_exited',

  // Actions & Execution
  ACTION_APPLIED: 'poker:action_applied',
  ACTION_TAKEN: 'poker:action_taken',
  AWAITING_HUMAN_ACTION: 'poker:awaiting_human_action',

  // Ambient & Table Talk
  SPEECH: 'poker:speech',
  SPEECH_RESPONSE: 'poker:speech_response',
  AMBIENT_SPOKEN: 'poker:ambient_spoken',
  AMBIENT_EVALUATED: 'poker:ambient_evaluated',
  ACTORS_LIST: 'poker:actors_list',
} as const;

export type PokerEventType = (typeof PokerEvent)[keyof typeof PokerEvent];

export function isPokerEvent(value: unknown): value is PokerEventType {
  return typeof value === 'string' && Object.values(PokerEvent).includes(value as PokerEventType);
}
