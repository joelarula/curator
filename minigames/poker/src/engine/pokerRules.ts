/**
 * Declarative Texas Hold'em Table Rules & Game Specification.
 * Pure TypeScript implementation replacing legacy poker_rules.coffee.
 */

import {
  PokerActionType,
  PokerStreet,
  type PokerActionTypeValue,
} from '../models/pokerContracts.ts';
import type { Suit, Rank } from '../types.ts';
import { SUITS, RANKS } from '../types.ts';
import { HandCategory } from './pokerEvaluator.ts';

export interface TableRulesDefinition {
  name: string;
  variant: string;
  maxSeats: number;
  startingChips: number;
  blinds: {
    smallBlind: number;
    bigBlind: number;
    minRaise: number;
  };
  deck: {
    cards: number;
    suits: Suit[];
    ranks: Rank[];
  };
  streets: Array<{
    id: string;
    name: string;
    cardsToDeal: number;
    burn: number;
  }>;
  actions: {
    allowed: string[];
    forbidFoldOnZeroCall: boolean;
    minRaiseMultiplier: number;
    autoAllInOnShortStack: boolean;
  };
  speechActs?: string[];
}

export const tableRules: TableRulesDefinition = {
  name: "Texas Hold'em No-Limit",
  variant: 'flop_game',
  maxSeats: 6,
  startingChips: 1000,
  blinds: {
    smallBlind: 10,
    bigBlind: 20,
    minRaise: 20,
  },
  deck: {
    cards: 52,
    suits: [...SUITS],
    ranks: [...RANKS],
  },
  streets: [
    { id: PokerStreet.PREFLOP, name: 'Pre-flop', cardsToDeal: 0, burn: 0 },
    { id: PokerStreet.FLOP, name: 'Flop', cardsToDeal: 3, burn: 1 },
    { id: PokerStreet.TURN, name: 'Turn', cardsToDeal: 1, burn: 1 },
    { id: PokerStreet.RIVER, name: 'River', cardsToDeal: 1, burn: 1 },
    { id: PokerStreet.SHOWDOWN, name: 'Showdown', cardsToDeal: 0, burn: 0 },
  ],
  actions: {
    allowed: [
      PokerActionType.CHECK,
      PokerActionType.CALL,
      PokerActionType.RAISE,
      PokerActionType.ALL_IN,
      PokerActionType.FOLD,
    ],
    forbidFoldOnZeroCall: true,
    minRaiseMultiplier: 1.0,
    autoAllInOnShortStack: true,
  },
};

export function getRulesDescription(): string {
  return `Texas Hold'em Table Rules & Protocol:
- Allowed betting actions: CHECK, CALL, RAISE, ALL_IN, FOLD.
- Cost to Call = Current Bet - Your Street Bet.
- If Cost to Call is 0: you CANNOT FOLD. You must CHECK or RAISE (never fold for free).
- If Cost to Call > 0: you can CALL, RAISE, ALL_IN, or FOLD (CHECK is illegal when facing a bet).
- When raising: your total wager must be at least Cost to Call + Min Raise, up to your total chip stack.
- When chips <= Cost to Call: your only aggressive options are CALL (putting you ALL-IN) or ALL_IN.
- Table Discourse: You autonomously choose when to speak (TABLE_TALK, BANTER, WHISPER, PROVOKE, GOSSIP) or stay silent based on your persona.`;
}

export interface HandRankingEntry {
  /** 10 = strongest; matches the evaluator's category rank. */
  rank: number;
  category: HandCategory;
  name: string;
  description: string;
  example: string;
  /** Number of 7-card deals (2 hole + 5 board) whose best hand is this category, out of C(52,7). */
  combinations: number;
  /** Chance that the best 7-card hand is this category, in percent. */
  probability: number;
  /** Odds against, as "N : 1". */
  oddsAgainst: string;
}

const SEVEN_CARD_DEALS = 133_784_560;

const HAND_RANKING_SPECS: Array<Omit<HandRankingEntry, 'probability' | 'oddsAgainst'>> = [
  { rank: 10, category: HandCategory.ROYAL_FLUSH, name: 'Royal Flush', description: 'A-K-Q-J-10, all the same suit', example: 'A♠ K♠ Q♠ J♠ 10♠', combinations: 4_324 },
  { rank: 9, category: HandCategory.STRAIGHT_FLUSH, name: 'Straight Flush', description: 'Five cards in sequence, all the same suit', example: '9♥ 8♥ 7♥ 6♥ 5♥', combinations: 37_260 },
  { rank: 8, category: HandCategory.FOUR_OF_A_KIND, name: 'Four of a Kind', description: 'Four cards of the same rank', example: 'Q♣ Q♦ Q♥ Q♠ 7♦', combinations: 224_848 },
  { rank: 7, category: HandCategory.FULL_HOUSE, name: 'Full House', description: 'Three of a kind plus a pair', example: 'J♠ J♥ J♦ 4♣ 4♠', combinations: 3_473_184 },
  { rank: 6, category: HandCategory.FLUSH, name: 'Flush', description: 'Five cards of the same suit, not in sequence', example: 'K♦ 10♦ 8♦ 5♦ 2♦', combinations: 4_047_644 },
  { rank: 5, category: HandCategory.STRAIGHT, name: 'Straight', description: 'Five cards in sequence, mixed suits (A-2-3-4-5 counts)', example: '10♣ 9♦ 8♠ 7♥ 6♣', combinations: 6_180_020 },
  { rank: 4, category: HandCategory.THREE_OF_A_KIND, name: 'Three of a Kind', description: 'Three cards of the same rank', example: '8♠ 8♥ 8♦ K♣ 3♠', combinations: 6_461_620 },
  { rank: 3, category: HandCategory.TWO_PAIR, name: 'Two Pair', description: 'Two different pairs', example: 'A♥ A♣ 6♠ 6♦ J♥', combinations: 31_433_400 },
  { rank: 2, category: HandCategory.ONE_PAIR, name: 'One Pair', description: 'Two cards of the same rank', example: '10♥ 10♠ K♦ 7♣ 4♥', combinations: 58_627_800 },
  { rank: 1, category: HandCategory.HIGH_CARD, name: 'High Card', description: 'None of the above; highest card plays', example: 'A♦ J♣ 8♥ 6♠ 2♣', combinations: 23_294_460 },
];

/** Hold'em hand rankings, strongest first, with how often each is the best 7-card hand. */
export function getHandRankings(): HandRankingEntry[] {
  return HAND_RANKING_SPECS.map((h) => {
    const against = (SEVEN_CARD_DEALS - h.combinations) / h.combinations;
    const odds = against < 10 ? against.toFixed(1) : Math.round(against).toLocaleString('en-US');
    return {
      ...h,
      probability: Math.round((h.combinations / SEVEN_CARD_DEALS) * 1e6) / 1e4,
      oddsAgainst: `${odds} : 1`,
    };
  });
}

/** Plain-text rules sheet for players: table setup, betting protocol and hand rankings. */
export function formatPokerRulesSheet(blinds?: { smallBlind?: number; bigBlind?: number }): string {
  const sb = blinds?.smallBlind ?? tableRules.blinds.smallBlind;
  const bb = blinds?.bigBlind ?? tableRules.blinds.bigBlind;
  const streets = tableRules.streets.map((s) => s.name).join(' → ');
  const rows = getHandRankings().map(
    (h) =>
      `  ${String(h.rank).padStart(2)}. ${h.name.padEnd(16)} ${h.example.padEnd(18)} ${`${h.probability.toFixed(4)}%`.padStart(9)}  ${h.oddsAgainst.padStart(13)}  ${h.description}`
  );
  return [
    `${tableRules.name}`,
    `- Up to ${tableRules.maxSeats} seats, ${tableRules.deck.cards}-card deck, blinds ${sb}/${bb}.`,
    `- Each player gets 2 hole cards; 5 community cards are dealt: ${streets}.`,
    `- Best five-card hand from your 2 hole cards + 5 board cards wins; equal hands split the pot.`,
    '',
    // The discourse line is persona guidance for AI seats, not a rule
    ...getRulesDescription().split('\n').filter((line) => !line.startsWith('- Table Discourse')),
    '',
    'Hand rankings (strongest first; chance it is your best 7-card hand):',
    `  ${'#'.padStart(2)}  ${'Hand'.padEnd(16)} ${'Example'.padEnd(18)} ${'Chance'.padStart(9)}  ${'Odds against'.padStart(13)}  Description`,
    ...rows,
  ].join('\n');
}

function extractRawAction(raw: any): { type: string; amount?: number } {
  if (!raw) return { type: '' };
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return extractRawAction(JSON.parse(trimmed));
      } catch (_) {}
    }
    return { type: trimmed.toUpperCase() };
  }
  if (typeof raw === 'object') {
    if (raw.turnAction) {
      const nested = extractRawAction(raw.turnAction);
      if (nested.type) {
        return { type: nested.type, amount: typeof raw.amount === 'number' ? raw.amount : nested.amount };
      }
    }
    if (raw.action) {
      const nested = extractRawAction(raw.action);
      if (nested.type) {
        return { type: nested.type, amount: typeof raw.amount === 'number' ? raw.amount : nested.amount };
      }
    }
    if (typeof raw.type === 'string') {
      return {
        type: raw.type.trim().toUpperCase(),
        amount: typeof raw.amount === 'number' ? raw.amount : undefined,
      };
    }
  }
  return { type: '' };
}

export function sanitizeAction(
  rawAction: any,
  toCall = 0,
  chips = 0,
  minRaise = 20,
): { type: string; amount?: number } {
  const canCheck = toCall === 0;
  const extracted = extractRawAction(rawAction);
  let actionType = extracted.type || (canCheck ? PokerActionType.CHECK : PokerActionType.FOLD);

  if (actionType === 'BET') {
    actionType = PokerActionType.RAISE;
  } else if (actionType === 'SHOVE' || actionType === 'ALLIN' || actionType === 'ALL-IN') {
    actionType = PokerActionType.ALL_IN;
  }

  const VALID_ACTIONS: string[] = [
    PokerActionType.CHECK,
    PokerActionType.CALL,
    PokerActionType.RAISE,
    PokerActionType.ALL_IN,
    PokerActionType.FOLD,
  ];
  if (!VALID_ACTIONS.includes(actionType)) {
    actionType = canCheck ? PokerActionType.CHECK : (chips >= toCall ? PokerActionType.CALL : PokerActionType.ALL_IN);
  }

  if (canCheck && (actionType === PokerActionType.FOLD || actionType === PokerActionType.CALL)) {
    actionType = PokerActionType.CHECK;
  }
  if (!canCheck && actionType === PokerActionType.CHECK) {
    actionType = chips > 0 ? PokerActionType.CALL : PokerActionType.FOLD;
  }

  let amount = extracted.amount;
  if (actionType === PokerActionType.CALL) {
    amount = Math.min(chips, toCall);
  } else if (actionType === PokerActionType.RAISE) {
    const minReq = toCall + minRaise;
    if (!amount || amount < minReq) {
      amount = minReq;
    }
    if (amount >= chips) {
      actionType = PokerActionType.ALL_IN;
      amount = chips;
    }
  } else if (actionType === PokerActionType.ALL_IN) {
    amount = chips;
  }

  return {
    type: actionType,
    amount,
  };
}

const ACTION_DEFAULTS: Partial<Record<PokerActionTypeValue, { label: (amt?: number) => string; aliases: string[] }>> = {
  [PokerActionType.CHECK]: { label: () => 'Check', aliases: ['k'] },
  [PokerActionType.CALL]: { label: (amt = 0) => `Call $${amt}`, aliases: ['c'] },
  [PokerActionType.FOLD]: { label: () => 'Fold', aliases: ['f'] },
  [PokerActionType.ALL_IN]: { label: (amt = 0) => `All-In ($${amt})`, aliases: ['allin', 'all-in', 'shove'] },
  [PokerActionType.RAISE]: { label: (amt = 0) => `Raise to $${amt}+`, aliases: ['r', 'raise'] },
};

function createActionChoice(
  type: PokerActionTypeValue,
  options: {
    id?: string;
    label?: string;
    amount?: number;
    minAmount?: number;
    maxAmount?: number;
    aliases?: string[];
    usage?: string;
  } = {}
) {
  const id = options.id || type.toLowerCase();
  const defaults = ACTION_DEFAULTS[type] ?? { label: () => type, aliases: [] };
  const label = options.label || defaults.label(options.amount);
  const aliases = options.aliases || defaults.aliases;
  const action = options.amount !== undefined ? { type, amount: options.amount } : { type };

  return {
    id,
    label,
    aliases,
    usage: options.usage || (type === PokerActionType.RAISE ? '<amount>' : undefined),
    minAmount: options.minAmount,
    maxAmount: options.maxAmount,
    action,
  };
}

export function getLegalChoices(
  toCall = 0,
  chips = 0,
  minRaise = 20,
  currentBet = 0,
): any[] {
  const choices: any[] = [];
  const canCheck = toCall === 0;

  if (canCheck) {
    choices.push(createActionChoice(PokerActionType.CHECK));
    if (chips >= minRaise) {
      choices.push(
        createActionChoice(PokerActionType.RAISE, {
          id: 'bet',
          label: `Bet (min $${minRaise})`,
          amount: minRaise,
          minAmount: minRaise,
          maxAmount: chips,
          aliases: ['b', 'bet', 'r', 'raise'],
        })
      );
    }
  } else {
    if (chips > toCall) {
      choices.push(createActionChoice(PokerActionType.CALL, { amount: toCall }));
      const minRaiseTotal = toCall + minRaise;
      if (chips >= minRaiseTotal) {
        choices.push(
          createActionChoice(PokerActionType.RAISE, {
            amount: minRaiseTotal,
            minAmount: minRaiseTotal,
            maxAmount: chips,
          })
        );
      }
    }
  }

  if (chips > 0) {
    choices.push(createActionChoice(PokerActionType.ALL_IN, { amount: chips }));
  }

  if (!canCheck) {
    choices.push(createActionChoice(PokerActionType.FOLD));
  }

  return choices;
}

export function getPokerRules() {
  return {
    tableRules,
    getRulesDescription,
    getHandRankings,
    formatPokerRulesSheet,
    sanitizeAction,
    getLegalChoices,
  };
}

