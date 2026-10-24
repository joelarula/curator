/**
 * Poker Domain Security Roles (RBAC).
 * Defines declarative roles for table administration, dealer actions, player wagering, and spectator viewing.
 */

export const PokerRole = {
  ADMIN: 'poker:admin',
  DEALER: 'poker:dealer',
  PLAYER: 'poker:player',
  SPECTATOR: 'poker:spectator',
} as const;

export type PokerRole = (typeof PokerRole)[keyof typeof PokerRole];
