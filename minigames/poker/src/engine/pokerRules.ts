/**
 * Declarative Texas Hold'em Table Rules & Game Specification.
 * Pure TypeScript implementation replacing legacy poker_rules.coffee.
 */

import {
  PokerActionType,
  PokerStreet,
  type PokerActionTypeValue,
  PokerTool,
} from '../models/pokerContracts.ts';
import type { Suit, Rank } from '../types.ts';
import { SUITS, RANKS } from '../types.ts';

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
- If Cost to Call is 0: you CANNOT FOLD. You must CHECK or RAISE (never fold for free).
- If Cost to Call > 0: you can CALL, RAISE, ALL_IN, or FOLD.
- When raising: your total wager must be at least Cost to Call + Min Raise, up to your total chip stack.
- When chips <= Cost to Call: your only aggressive options are CALL (putting you ALL-IN) or ALL_IN.
- Table Discourse: You autonomously choose when to speak (TABLE_TALK, BANTER, WHISPER, PROVOKE, GOSSIP) or stay silent based on your persona.`;
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
    tool: PokerTool.APPLY_ACTION,
    args: { action },
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
    sanitizeAction,
    getLegalChoices,
  };
}

