/**
 * Declarative Texas Hold'em Table Rules & Game Specification.
 * Pure TypeScript implementation replacing legacy poker_rules.coffee.
 */

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
    suits: string[];
    ranks: string[];
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
  speechActs: string[];
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
    suits: ['♠', '♥', '♦', '♣'],
    ranks: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
  },
  streets: [
    { id: 'PREFLOP', name: 'Pre-flop', cardsToDeal: 0, burn: 0 },
    { id: 'FLOP', name: 'Flop', cardsToDeal: 3, burn: 1 },
    { id: 'TURN', name: 'Turn', cardsToDeal: 1, burn: 1 },
    { id: 'RIVER', name: 'River', cardsToDeal: 1, burn: 1 },
    { id: 'SHOWDOWN', name: 'Showdown', cardsToDeal: 0, burn: 0 },
  ],
  actions: {
    allowed: ['CHECK', 'CALL', 'RAISE', 'ALL_IN', 'FOLD'],
    forbidFoldOnZeroCall: true,
    minRaiseMultiplier: 1.0,
    autoAllInOnShortStack: true,
  },
  speechActs: ['TABLE_TALK', 'BANTER', 'WHISPER', 'PROVOKE', 'GOSSIP'],
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

export function sanitizeAction(
  rawAction: any,
  toCall = 0,
  chips = 0,
  minRaise = 20,
): { type: string; amount?: number } {
  const canCheck = toCall === 0;
  let actionType = (rawAction?.action || rawAction?.type || (canCheck ? 'CHECK' : 'FOLD')).toUpperCase();

  if (canCheck && actionType === 'FOLD') {
    actionType = 'CHECK';
  }
  if (!canCheck && actionType === 'CHECK') {
    actionType = 'CALL';
  }

  let amount = rawAction?.amount;
  if (actionType === 'CALL') {
    amount = Math.min(chips, toCall);
  } else if (actionType === 'RAISE') {
    const minReq = toCall + minRaise;
    if (!amount || amount < minReq) {
      amount = minReq;
    }
    if (amount >= chips) {
      actionType = 'ALL_IN';
      amount = chips;
    }
  } else if (actionType === 'ALL_IN') {
    amount = chips;
  }

  return {
    type: actionType,
    amount,
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
    choices.push({
      id: 'check',
      label: 'Check',
      aliases: ['k'],
      tool: 'poker_apply_action',
      args: { action: { type: 'CHECK' } },
      action: { type: 'CHECK' },
    });
    if (chips >= minRaise * 2) {
      choices.push({
        id: 'bet_min',
        label: `Bet $${minRaise * 2}`,
        aliases: ['b', 'bet'],
        usage: '<amount>',
        tool: 'poker_apply_action',
        args: { action: { type: 'RAISE', amount: minRaise * 2 } },
        action: { type: 'RAISE', amount: minRaise * 2 },
      });
    }
    if (chips >= minRaise * 5) {
      choices.push({
        id: 'bet_med',
        label: `Bet $${minRaise * 5}`,
        aliases: ['b', 'bet'],
        usage: '<amount>',
        tool: 'poker_apply_action',
        args: { action: { type: 'RAISE', amount: minRaise * 5 } },
        action: { type: 'RAISE', amount: minRaise * 5 },
      });
    }
    if (chips > 0) {
      choices.push({
        id: 'all_in',
        label: `All-In ($${chips})`,
        aliases: ['allin', 'all-in', 'shove'],
        tool: 'poker_apply_action',
        args: { action: { type: 'ALL_IN', amount: chips } },
        action: { type: 'ALL_IN', amount: chips },
      });
    }
  } else {
    if (chips > toCall) {
      choices.push({
        id: 'call',
        label: `Call $${toCall}`,
        aliases: ['c'],
        tool: 'poker_apply_action',
        args: { action: { type: 'CALL', amount: toCall } },
        action: { type: 'CALL', amount: toCall },
      });
      const raiseTotal = toCall + minRaise * 2;
      if (chips >= raiseTotal) {
        choices.push({
          id: 'raise_min',
          label: `Raise to $${currentBet + minRaise * 2}`,
          aliases: ['r', 'raise'],
          usage: '<amount>',
          tool: 'poker_apply_action',
          args: { action: { type: 'RAISE', amount: raiseTotal } },
          action: { type: 'RAISE', amount: raiseTotal },
        });
      }
      choices.push({
        id: 'all_in',
        label: `All-In ($${chips})`,
        aliases: ['allin', 'all-in', 'shove'],
        tool: 'poker_apply_action',
        args: { action: { type: 'ALL_IN', amount: chips } },
        action: { type: 'ALL_IN', amount: chips },
      });
      choices.push({
        id: 'fold',
        label: 'Fold',
        aliases: ['f'],
        tool: 'poker_apply_action',
        args: { action: { type: 'FOLD' } },
        action: { type: 'FOLD' },
      });
    } else {
      choices.push({
        id: 'all_in',
        label: `All-In ($${chips})`,
        aliases: ['allin', 'all-in', 'shove'],
        tool: 'poker_apply_action',
        args: { action: { type: 'ALL_IN', amount: chips } },
        action: { type: 'ALL_IN', amount: chips },
      });
      choices.push({
        id: 'fold',
        label: 'Fold',
        aliases: ['f'],
        tool: 'poker_apply_action',
        args: { action: { type: 'FOLD' } },
        action: { type: 'FOLD' },
      });
    }
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

