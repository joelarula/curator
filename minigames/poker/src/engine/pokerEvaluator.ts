import type { Card } from '../types.ts';
import {
  CARD_RANK_VALUES as RANK_VALUES,
  getCombinations,
  sortCardsByRank,
} from '../deck/index.ts';

export const HandCategory = {
  HIGH_CARD: 'HIGH_CARD',
  ONE_PAIR: 'ONE_PAIR',
  TWO_PAIR: 'TWO_PAIR',
  THREE_OF_A_KIND: 'THREE_OF_A_KIND',
  STRAIGHT: 'STRAIGHT',
  FLUSH: 'FLUSH',
  FULL_HOUSE: 'FULL_HOUSE',
  FOUR_OF_A_KIND: 'FOUR_OF_A_KIND',
  STRAIGHT_FLUSH: 'STRAIGHT_FLUSH',
  ROYAL_FLUSH: 'ROYAL_FLUSH',
} as const;

export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];

const CATEGORY_RANKS: Record<HandCategory, number> = {
  [HandCategory.HIGH_CARD]: 1,
  [HandCategory.ONE_PAIR]: 2,
  [HandCategory.TWO_PAIR]: 3,
  [HandCategory.THREE_OF_A_KIND]: 4,
  [HandCategory.STRAIGHT]: 5,
  [HandCategory.FLUSH]: 6,
  [HandCategory.FULL_HOUSE]: 7,
  [HandCategory.FOUR_OF_A_KIND]: 8,
  [HandCategory.STRAIGHT_FLUSH]: 9,
  [HandCategory.ROYAL_FLUSH]: 10,
};

export interface EvaluatedHand {
  category: HandCategory;
  score: number;
  description: string;
  bestFiveCards: Card[];
}

/**
 * Evaluates an exact 5-card poker hand.
 */
function evaluateFiveCards(hand: Card[]): EvaluatedHand {
  const sorted = sortCardsByRank(hand, 'desc');
  const values = sorted.map((c) => RANK_VALUES[c.rank]);
  const suits = sorted.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);

  // Check straight (including A-2-3-4-5 wheel straight)
  let isStraight = false;
  let straightHigh = 0;

  const isStandardStraight =
    values[0] - values[1] === 1 &&
    values[1] - values[2] === 1 &&
    values[2] - values[3] === 1 &&
    values[3] - values[4] === 1;

  if (isStandardStraight) {
    isStraight = true;
    straightHigh = values[0];
  } else if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    // Wheel straight: Ace counts as 1 (5 high straight)
    isStraight = true;
    straightHigh = 5;
  }

  // Count rank frequencies
  const counts: Record<number, number> = {};
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1;
  }

  const freqEntries = Object.entries(counts)
    .map(([val, count]) => ({ val: Number(val), count }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  let category: HandCategory = HandCategory.HIGH_CARD;
  let score = 0;
  let description = '';

  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      category = HandCategory.ROYAL_FLUSH;
      description = `Royal Flush in ${suits[0]}`;
    } else {
      category = HandCategory.STRAIGHT_FLUSH;
      description = `${straightHigh}-high Straight Flush in ${suits[0]}`;
    }
    score = CATEGORY_RANKS[category] * 1e8 + straightHigh;
  } else if (freqEntries[0].count === 4) {
    category = HandCategory.FOUR_OF_A_KIND;
    const quad = freqEntries[0].val;
    const kicker = freqEntries[1].val;
    description = `Four of a Kind (${quad}s)`;
    score = CATEGORY_RANKS[category] * 1e8 + quad * 1e4 + kicker;
  } else if (freqEntries[0].count === 3 && freqEntries[1].count === 2) {
    category = HandCategory.FULL_HOUSE;
    const trio = freqEntries[0].val;
    const pair = freqEntries[1].val;
    description = `Full House (${trio}s full of ${pair}s)`;
    score = CATEGORY_RANKS[category] * 1e8 + trio * 1e4 + pair;
  } else if (isFlush) {
    category = HandCategory.FLUSH;
    description = `Flush (${suits[0]}) high ${values[0]}`;
    score =
      CATEGORY_RANKS[category] * 1e8 +
      values[0] * 1e6 +
      values[1] * 1e4 +
      values[2] * 1e2 +
      values[3] +
      values[4] * 0.01;
  } else if (isStraight) {
    category = HandCategory.STRAIGHT;
    description = `${straightHigh}-high Straight`;
    score = CATEGORY_RANKS[category] * 1e8 + straightHigh;
  } else if (freqEntries[0].count === 3) {
    category = HandCategory.THREE_OF_A_KIND;
    const trio = freqEntries[0].val;
    const kicker1 = freqEntries[1].val;
    const kicker2 = freqEntries[2].val;
    description = `Three of a Kind (${trio}s)`;
    score = CATEGORY_RANKS[category] * 1e8 + trio * 1e4 + kicker1 * 100 + kicker2;
  } else if (freqEntries[0].count === 2 && freqEntries[1].count === 2) {
    category = HandCategory.TWO_PAIR;
    const highPair = Math.max(freqEntries[0].val, freqEntries[1].val);
    const lowPair = Math.min(freqEntries[0].val, freqEntries[1].val);
    const kicker = freqEntries[2].val;
    description = `Two Pair (${highPair}s and ${lowPair}s)`;
    score = CATEGORY_RANKS[category] * 1e8 + highPair * 1e4 + lowPair * 100 + kicker;
  } else if (freqEntries[0].count === 2) {
    category = HandCategory.ONE_PAIR;
    const pair = freqEntries[0].val;
    const kickers = freqEntries.slice(1).map((f) => f.val);
    description = `One Pair of ${pair}s`;
    score =
      CATEGORY_RANKS[category] * 1e8 +
      pair * 1e4 +
      kickers[0] * 100 +
      kickers[1] +
      (kickers[2] || 0) * 0.01;
  } else {
    category = HandCategory.HIGH_CARD;
    description = `High Card ${values[0]}`;
    score =
      CATEGORY_RANKS[category] * 1e8 +
      values[0] * 1e6 +
      values[1] * 1e4 +
      values[2] * 1e2 +
      values[3] +
      values[4] * 0.01;
  }

  return {
    category,
    score,
    description,
    bestFiveCards: sorted,
  };
}

/**
 * Finds the highest-ranking 5-card hand out of up to 7 cards (2 hole + 5 community).
 */
export function evaluateBestHand(holeCards: Card[], communityCards: Card[]): EvaluatedHand {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) {
    // Pre-flop or incomplete board: evaluate hole cards or available cards
    const sorted = sortCardsByRank(allCards, 'desc');
    const isPair = sorted.length === 2 && sorted[0].rank === sorted[1].rank;
    const category: HandCategory = isPair ? HandCategory.ONE_PAIR : HandCategory.HIGH_CARD;
    const score = isPair ? 2e8 + RANK_VALUES[sorted[0].rank] * 1e4 : 1e8 + (RANK_VALUES[sorted[0]?.rank] || 0) * 1e4;
    return {
      category,
      score,
      description: isPair ? `Pocket ${sorted[0].rank}s` : `Hole Cards (${sorted.map((c) => c.rank).join(', ')})`,
      bestFiveCards: sorted,
    };
  }

  const combos = getCombinations(allCards, 5);
  let best: EvaluatedHand | null = null;

  for (const combo of combos) {
    const evaluated = evaluateFiveCards(combo);
    if (!best || evaluated.score > best.score) {
      best = evaluated;
    }
  }

  return best!;
}
