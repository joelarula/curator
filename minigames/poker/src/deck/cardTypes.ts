/**
 * Generic Card Deck Domain Types and Standards.
 * Standard French 52-card deck definitions independent of any specific card game.
 */

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const CARD_RANK_VALUES: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export const SUIT_COLORS: Record<Suit, string> = {
  '♠': '\x1b[34m', // blue/black
  '♣': '\x1b[34m', // blue/black
  '♥': '\x1b[31m', // red
  '♦': '\x1b[31m', // red
};
