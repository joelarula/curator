import { defineTool } from './CuratorTool.js';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function makeDeck(): string[] {
  const deck: string[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(rank + suit);
  return deck;
}

function shuffle(deck: string[]): string[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Shuffle and deal cards to players. Sets state.deck, state.hand_N, state.community, state.pot, state.bets */
export const deal_cards = defineTool({
  name: 'deal_cards',
  description: 'Shuffle a standard 52-card deck and deal 2 cards to each player. Initializes the game state.',
  parameters: {
    type: 'object',
    properties: {
      players: { type: 'number', description: 'Number of players (default 3)' },
    }
  },
  execute: async (args, ctx) => {
    if (!ctx.prisma) return 'Error: no DB context';
    const numPlayers = args.players ?? 3;
    const deck = shuffle(makeDeck());
    
    const hands: Record<string, string[]> = {};
    for (let i = 1; i <= numPlayers; i++) {
      hands[`hand_${i}`] = [deck.pop()!, deck.pop()!];
    }

    const bets: Record<string, number> = {};
    const active: number[] = [];
    for (let i = 1; i <= numPlayers; i++) { bets[i] = 0; active.push(i); }

    const convo = await ctx.prisma.conversation.findFirst({
      where: { id: ctx.conversationId }
    });
    const existing = (convo?.state as Record<string, any>) || {};
    
    // Preserve dealer and hand number or initialize
    const dealer_index = existing.dealer_index ?? 0;
    const hand_number = (existing.hand_number ?? 0) + 1;

    const gameState = {
      ...existing,
      dealer_index,
      hand_number,
      deck,
      community: [] as string[],
      pot: 0,
      bets,
      active_players: active,
      current_bet: 0,
      phase: 'preflop',
      ...hands
    };

    await ctx.prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: { state: gameState }
    });

    const summary = Object.entries(hands).map(([k, v]) => `${k}: [${v.join(', ')}]`).join(' | ');
    return `Hand ${hand_number} Dealt! Dealer is Player ${active[dealer_index]}. ${summary}. Community: []. Pot: 0`;
  }
});

/** Reveal N community cards from the deck. Appends to state.community. */
export const reveal_community = defineTool({
  name: 'reveal_community',
  description: 'Reveal N community cards from the deck onto the table.',
  parameters: {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Number of cards to reveal (3 for flop, 1 for turn/river)' }
    },
    required: ['count']
  },
  execute: async (args, ctx) => {
    if (!ctx.prisma) return 'Error: no DB context';
    const convo = await ctx.prisma.conversation.findFirst({ where: { id: ctx.conversationId } });
    const state = (convo?.state as Record<string, any>) || {};

    const deck: string[] = state.deck || [];
    const community: string[] = state.community || [];
    const newCards: string[] = [];

    for (let i = 0; i < args.count; i++) {
      const card = deck.pop();
      if (card) { community.push(card); newCards.push(card); }
    }

    await ctx.prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: { state: { ...state, deck, community } }
    });

    return `Revealed: [${newCards.join(', ')}]. Community now: [${community.join(', ')}]`;
  }
});

/** Process a player's bet action (fold/call/raise). Updates pot, bets, active_players in state. */
export const apply_bet = defineTool({
  name: 'apply_bet',
  description: "Apply a player's poker action (fold, call, raise <amount>) to the game state.",
  parameters: {
    type: 'object',
    properties: {
      player: { type: 'number', description: 'Player number (1, 2, or 3)' },
      action: { type: 'string', description: "Player action: 'fold', 'call', or 'raise 50'" }
    },
    required: ['player', 'action']
  },
  execute: async (args, ctx) => {
    if (!ctx.prisma) return 'Error: no DB context';
    const convo = await ctx.prisma.conversation.findFirst({ where: { id: ctx.conversationId } });
    const state = (convo?.state as Record<string, any>) || {};

    const player: number = args.player;
    let actionRaw: string = (args.action || '').toString().trim();
    let actionStr = actionRaw.toLowerCase();
    let amount = 10;

    // Try parsing as JSON in case the agent output JSON
    try {
      const cleaned = actionRaw.replace(/^```json/i, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object') {
        actionStr = (parsed.action || '').toLowerCase();
        if (parsed.amount) amount = parseInt(parsed.amount, 10);
      }
    } catch (e) {
      // Not JSON, fallback to simple string parsing
      if (actionStr.startsWith('raise')) {
        const parts = actionStr.split(' ');
        if (parts[1]) amount = parseInt(parts[1], 10);
        actionStr = 'raise';
      }
    }

    let result = '';

    let pot: number = state.pot ?? 0;
    const bets: Record<number, number> = state.bets ?? {};
    let active: number[] = state.active_players ?? [];
    const currentBet: number = state.current_bet ?? 0;

    if (actionStr === 'fold') {
      active = active.filter((p: number) => p !== player);
      result = `Player ${player} folds. Active players: [${active.join(', ')}]`;
    } else if (actionStr === 'call') {
      const toCall = currentBet - (bets[player] ?? 0);
      bets[player] = (bets[player] ?? 0) + toCall;
      pot += toCall;
      result = `Player ${player} calls ${toCall}. Pot: ${pot}`;
    } else if (actionStr === 'raise') {
      const toCall = currentBet - (bets[player] ?? 0);
      const total = toCall + amount;
      bets[player] = (bets[player] ?? 0) + total;
      pot += total;
      state.current_bet = (bets[player] ?? 0);
      result = `Player ${player} raises by ${amount}. Pot: ${pot}`;
    } else {
      result = `Player ${player} took no valid action ("${actionRaw}").`;
    }

    await ctx.prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: { state: { ...state, pot, bets, active_players: active } }
    });

    return result;
  }
});
