/**
 * Generic Card Deck Utilities.
 * Pure, stateless functions for standard card deck generation, shuffling, drawing,
 * combinatorics, and formatting.
 */

import {
  SUITS,
  RANKS,
  CARD_RANK_VALUES,
  SUIT_COLORS,
  type Card,
  type Rank,
  type Suit,
} from './cardTypes.ts';

export interface CreateDeckOptions {
  suits?: readonly Suit[] | Suit[];
  ranks?: readonly Rank[] | Rank[];
  shuffle?: boolean;
  rng?: () => number;
}

/**
 * Creates a standard card deck (defaults to standard 52-card deck).
 * Can be automatically shuffled using Fisher-Yates.
 */
export function createStandardDeck(options: CreateDeckOptions = {}): Card[] {
  const suits = options.suits || SUITS;
  const ranks = options.ranks || RANKS;
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }

  if (options.shuffle !== false) {
    shuffleDeck(deck, options.rng);
  }

  return deck;
}

/**
 * In-place Fisher-Yates array shuffle. Returns the shuffled array.
 */
export function shuffleDeck<T>(items: T[], rng: () => number = Math.random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = items[i];
    items[i] = items[j];
    items[j] = temp;
  }
  return items;
}

/**
 * Immutable card draw: draws `count` cards from the top of the deck.
 */
export function drawCards(deck: readonly Card[], count: number): { drawn: Card[]; remaining: Card[] } {
  const drawn = deck.slice(0, count);
  const remaining = deck.slice(count);
  return { drawn, remaining };
}

/**
 * Mutable pop helper: pops `count` cards from the end of the deck array.
 */
export function popCards(deck: Card[], count: number): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < count; i++) {
    const card = deck.pop();
    if (card) cards.push(card);
  }
  return cards;
}

/**
 * Generates all combinations of size `k` from an array of items (n choose k).
 */
export function getCombinations<T>(items: readonly T[], size: number = 5): T[][] {
  const result: T[][] = [];

  function combine(start: number, combo: T[]) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      combo.push(items[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }

  combine(0, []);
  return result;
}

/**
 * Compares two cards by rank value (asc: negative if a < b, positive if a > b).
 */
export function compareCardsByRank(a: Card, b: Card): number {
  return (CARD_RANK_VALUES[a.rank] ?? 0) - (CARD_RANK_VALUES[b.rank] ?? 0);
}

/**
 * Returns a sorted copy of the cards array by rank.
 */
export function sortCardsByRank(cards: readonly Card[], order: 'asc' | 'desc' = 'desc'): Card[] {
  const multiplier = order === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => compareCardsByRank(a, b) * multiplier);
}

/**
 * Formats a card into an ASCII badge representation (e.g., "[ A♠ ]").
 * Supports ANSI terminal colors for heart/diamond red vs spade/club blue.
 */
export function formatCard(c?: Card, options: { color?: boolean } = { color: true }): string {
  if (!c) return '[ -- ]';
  if (options.color !== false) {
    const color = SUIT_COLORS[c.suit] || '';
    const reset = '\x1b[0m';
    return `[ ${c.rank}${color}${c.suit}${reset} ]`;
  }
  return `[${c.rank}${c.suit}]`;
}

/**
 * Formats an array of cards into a string.
 */
export function formatCards(
  cards: readonly Card[] = [],
  options: { color?: boolean; separator?: string } = {}
): string {
  const color = options.color ?? false;
  const sep = options.separator ?? ' ';
  return cards.map((c) => formatCard(c, { color })).join(sep);
}

/**
 * Parses card text notation (e.g. "A♠", "10♦", "Kh", "2c") into a typed Card object.
 */
export function parseCard(input: string): Card | null {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim().replace(/[\[\]]/g, '');
  if (clean.length < 2) return null;

  const suitChar = clean.slice(-1);
  const rankStr = clean.slice(0, -1);

  const suitAliasMap: Record<string, Suit> = {
    '♠': '♠',
    s: '♠',
    S: '♠',
    '♥': '♥',
    h: '♥',
    H: '♥',
    '♦': '♦',
    d: '♦',
    D: '♦',
    '♣': '♣',
    c: '♣',
    C: '♣',
  };

  const suit = suitAliasMap[suitChar];
  const rank = RANKS.find((r) => r.toUpperCase() === rankStr.toUpperCase());

  if (!suit || !rank) return null;
  return { rank, suit };
}
