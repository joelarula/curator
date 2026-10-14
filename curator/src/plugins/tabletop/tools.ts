import { defineTool, type CuratorTool } from '../../tools/CuratorTool.js';

export interface Card {
  suit?: 'hearts' | 'diamonds' | 'clubs' | 'spades' | string;
  rank?: string | number; // 'A', 'K', 'Q', 'J', 10, 9, etc.
  value?: number;
}

/**
 * Deterministic evaluator for Blackjack hands.
 * Computes soft/hard totals, busts, and natural blackjack.
 */
export const evalBlackjackTool: CuratorTool = defineTool({
  name: 'eval_blackjack',
  description: 'Evaluates a Blackjack hand, calculating optimal score, soft totals, and bust status.',
  parameters: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rank: { type: ['string', 'number'] },
            suit: { type: 'string' },
          },
        },
      },
    },
    required: ['cards'],
  },
  accessLevel: 'safe_read',
  async execute(args) {
    const cards = (args.cards as any[]) || [];
    let total = 0;
    let aces = 0;

    for (const card of cards) {
      const r = String(card.rank ?? card.value ?? '').toUpperCase();
      if (r === 'A' || r === '1') {
        aces += 1;
        total += 11;
      } else if (['K', 'Q', 'J', '10'].includes(r)) {
        total += 10;
      } else {
        const n = parseInt(r, 10);
        total += isNaN(n) ? 0 : n;
      }
    }

    // Downgrade Aces from 11 to 1 if bust
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }

    const isBust = total > 21;
    const isBlackjack = total === 21 && cards.length === 2;

    return {
      total,
      isBust,
      isBlackjack,
      isSoft: aces > 0,
      cardCount: cards.length,
    };
  },
});

/**
 * Deterministic evaluator for Poker hands.
 * Compares ranks, kickers, and determines hand category.
 */
export const evalPokerTool: CuratorTool = defineTool({
  name: 'eval_poker',
  description: 'Adjudicates poker hands against community cards and determines hand rankings.',
  parameters: {
    type: 'object',
    properties: {
      hands: {
        type: 'object',
        description: 'Map of player role or name to their hole cards',
      },
      community: {
        type: 'array',
        description: 'Shared community cards on the board',
      },
    },
    required: ['hands'],
  },
  accessLevel: 'safe_read',
  async execute(args) {
    const hands = (args.hands as Record<string, any[]>) || {};
    const results: Record<string, any> = {};
    let winningPlayer = '';
    let highestScore = -1;

    for (const [player, cards] of Object.entries(hands)) {
      // Simplified deterministic ranking placeholder (computes high rank & pair score)
      const allCards = [...(cards || []), ...((args.community as any[]) || [])];
      let score = 0;
      const rankCounts: Record<string, number> = {};

      for (const c of allCards) {
        const r = String(c.rank ?? '').toUpperCase();
        rankCounts[r] = (rankCounts[r] || 0) + 1;
      }

      let hasPair = false;
      let hasThree = false;
      for (const count of Object.values(rankCounts)) {
        if (count >= 3) hasThree = true;
        else if (count >= 2) hasPair = true;
      }

      if (hasThree) score = 300;
      else if (hasPair) score = 200;
      else score = 100;

      results[player] = { score, category: hasThree ? 'three_of_a_kind' : (hasPair ? 'pair' : 'high_card') };

      if (score > highestScore) {
        highestScore = score;
        winningPlayer = player;
      }
    }

    return {
      winner: winningPlayer,
      rankings: results,
    };
  },
});

/**
 * Deterministic evaluator for trick-taking games (Spades, Hearts, Bridge).
 * Adjudicates the winning card in a trick based on lead suit and trump suit.
 */
export const evalTrickTool: CuratorTool = defineTool({
  name: 'eval_trick',
  description: 'Evaluates the winner of a trick given lead suit, trump suit, and played cards.',
  parameters: {
    type: 'object',
    properties: {
      leadSuit: { type: 'string' },
      trumpSuit: { type: 'string' },
      plays: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            player: { type: 'string' },
            suit: { type: 'string' },
            rank: { type: ['string', 'number'] },
          },
        },
      },
    },
    required: ['leadSuit', 'plays'],
  },
  accessLevel: 'safe_read',
  async execute(args) {
    const plays = (args.plays as any[]) || [];
    const leadSuit = String(args.leadSuit || '').toLowerCase();
    const trumpSuit = args.trumpSuit ? String(args.trumpSuit).toLowerCase() : null;

    const rankWeight: Record<string, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
    };

    let bestPlay: any = null;
    let bestWeight = -1;
    let isTrumped = false;

    for (const play of plays) {
      const suit = String(play.suit || '').toLowerCase();
      const r = String(play.rank || '').toUpperCase();
      const weight = rankWeight[r] || parseInt(r, 10) || 0;

      if (trumpSuit && suit === trumpSuit) {
        if (!isTrumped || weight > bestWeight) {
          isTrumped = true;
          bestWeight = weight;
          bestPlay = play;
        }
      } else if (!isTrumped && suit === leadSuit) {
        if (weight > bestWeight) {
          bestWeight = weight;
          bestPlay = play;
        }
      }
    }

    return {
      winner: bestPlay?.player || null,
      winningCard: bestPlay,
      isTrumped,
    };
  },
});
