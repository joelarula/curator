import { defineTool, type CuratorPlugin } from '@curator/agent-server';
import type { Card, PlayerState, PokerGameState, Rank, Suit, PlayerAction, SpeechAct, AmbientRemark, PersonaType, PlayerStanding } from '../types.js';
import { agenticDecidePokerAction, buildAgentSystemPrompt, callCuratorLlm } from '../engine/geminiAgent.js';
import { evaluateBestHand } from '../engine/pokerEvaluator.js';
import { loadCoffeeScript } from '../scripts/pokerHandScript.js';

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function sliceSidePots(players: PlayerState[]): { mainPot: number; sidePots: { amount: number; eligiblePlayerIds: string[] }[] } {
  // Calculate pot tiers based on all-in contributions
  const contributors = players.filter((p) => p.totalHandBet > 0).sort((a, b) => a.totalHandBet - b.totalHandBet);
  if (contributors.length === 0) return { mainPot: 0, sidePots: [] };

  const sidePots: { amount: number; eligiblePlayerIds: string[] }[] = [];
  let prevContribution = 0;

  for (let i = 0; i < contributors.length; i++) {
    const current = contributors[i].totalHandBet;
    const tierIncrement = current - prevContribution;
    if (tierIncrement > 0) {
      const eligible = contributors.slice(i).filter((p) => !p.folded).map((p) => p.id);
      const tierAmount = tierIncrement * (contributors.length - i);
      sidePots.push({ amount: tierAmount, eligiblePlayerIds: eligible });
      prevContribution = current;
    }
  }

  const mainPot = sidePots.length > 0 ? sidePots[0].amount : 0;
  return { mainPot, sidePots: sidePots.slice(1) };
}

// ----------------------------------------------------------------------------
// Tool Handlers
// ----------------------------------------------------------------------------

export const pokerInitLobbyTool = defineTool({
  name: 'poker_init_lobby',
  description: 'Initializes Texas Holdem lobby frame. Can accept dynamic initial players or start as an open table.',
  parameters: {
    type: 'object',
    properties: {
      tableId: { type: 'string' },
      startingChips: { type: 'number' },
      sbAmount: { type: 'number' },
      bbAmount: { type: 'number' },
      maxSeats: { type: 'number' },
      revealHandsOnSettle: { type: 'boolean' },
      maxHands: { type: 'number' },
      players: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            instruction: { type: 'string' },
            persona: { type: 'string' },
            model: { type: 'string' },
            isHuman: { type: 'boolean' },
            chips: { type: 'number' },
            seatIdx: { type: 'number' },
          },
          required: ['id', 'name'],
        },
      },
    },
  },
  execute: async (args) => {
    const startingChips = (args?.startingChips as number) || 1000;
    const maxSeats = (args?.maxSeats as number) || 6;
    const sbAmount = (args?.sbAmount as number) || 10;
    const bbAmount = (args?.bbAmount as number) || 20;
    const revealHandsOnSettle = args?.revealHandsOnSettle !== undefined ? Boolean(args.revealHandsOnSettle) : true;
    const maxHands = args?.maxHands !== undefined ? Number(args.maxHands) : undefined;

    let players: PlayerState[] = [];
    if (Array.isArray(args?.players)) {
      const walletsMap = (args?.wallets || args?.startingWallets || {}) as Record<string, number>;
      players = (args.players as any[]).map((p, idx) => {
        const wallet = Number(p.wallet ?? p.startingWallet ?? walletsMap[p.id] ?? p.chips ?? startingChips);
        const chips = Number(p.chips ?? p.buyIn ?? Math.min(wallet, startingChips));
        return {
          id: p.id,
          name: p.name,
          isHuman: p.isHuman ?? (p.persona === 'human' || p.id === 'hero'),
          instruction: p.instruction,
          persona: p.persona || (p.isHuman ? 'human' : 'shark'),
          model: p.model,
          wallet,
          buyIn: chips,
          chips,
          streetBet: 0,
          totalHandBet: 0,
          holeCards: [],
          folded: false,
          allIn: false,
          seatIdx: p.seatIdx !== undefined ? p.seatIdx : idx,
        };
      });
    } else if (args?.players === undefined) {
      // Default baseline roster if players parameter is completely omitted
      players = [
        {
          id: 'hero',
          name: 'You',
          isHuman: true,
          instruction: 'You are the human player (Hero) at the high-roller poker table.',
          persona: 'human',
          wallet: startingChips,
          buyIn: startingChips,
          chips: startingChips,
          streetBet: 0,
          totalHandBet: 0,
          holeCards: [],
          folded: false,
          allIn: false,
          seatIdx: 0,
        },
        {
          id: 'viper',
          name: 'Viper (Shark)',
          isHuman: false,
          instruction: "You are Viper, a ruthless and mathematically calculating poker shark at a high-stakes Texas Hold'em table. Your tone is cool, precise, psychological, and dismissive of emotional play. You never reveal your exact hole cards. When speaking, you comment on pot odds, variance, and the foolishness of loose play.",
          persona: 'shark',
          wallet: startingChips,
          buyIn: startingChips,
          chips: startingChips,
          streetBet: 0,
          totalHandBet: 0,
          holeCards: [],
          folded: false,
          allIn: false,
          seatIdx: 1,
        },
        {
          id: 'maddog',
          name: 'MadDog (Maniac)',
          isHuman: false,
          instruction: 'You are MadDog, a wild and loud poker maniac. You play loose, love bluffing, and shove chips into the middle for maximum adrenaline. Your tone is boisterous, confrontational, taunting, and energetic. Trash-talk, dare people to call, and embrace chaos.',
          persona: 'maniac',
          wallet: startingChips,
          buyIn: startingChips,
          chips: startingChips,
          streetBet: 0,
          totalHandBet: 0,
          holeCards: [],
          folded: false,
          allIn: false,
          seatIdx: 2,
        },
        {
          id: 'barnaby',
          name: 'Barnaby (Station)',
          isHuman: false,
          instruction: 'You are Barnaby, an affable, folksy, and warm calling station. You love chatting at the table, hate folding, and always wonder what the next card will bring. Your tone is grandfatherly, cheerful, gentle, and humorous.',
          persona: 'station',
          wallet: startingChips,
          buyIn: startingChips,
          chips: startingChips,
          streetBet: 0,
          totalHandBet: 0,
          holeCards: [],
          folded: false,
          allIn: false,
          seatIdx: 3,
        },
      ];
    }

    const startingWallets: Record<string, number> = {};
    players.forEach((p) => {
      startingWallets[p.id] = p.wallet ?? p.chips;
    });

    const gameState: PokerGameState = {
      tableId: (args?.tableId as string) || 'poker:high_roller_lounge',
      handNumber: 0,
      buttonIdx: 0,
      sbIdx: 1,
      bbIdx: 2,
      sbAmount,
      bbAmount,
      currentStreet: 'PREFLOP',
      board: [],
      deck: [],
      pot: 0,
      sidePots: [],
      currentBet: 0,
      minRaise: bbAmount,
      activePlayerIdx: 0,
      streetComplete: false,
      handOver: false,
      singleSurvivor: false,
      winnerIds: [],
      players,
      recentRemarks: [
        {
          speakerId: 'dealer',
          speakerName: 'Dealer',
          speechAct: 'TABLE_TALK',
          text: `Texas Hold'em table initialized (${players.length} players seated).`,
          timestamp: Date.now(),
        },
      ],
      maxSeats,
      startingChips,
      startingWallets,
      revealHandsOnSettle,
      maxHands,
    };

    return { gameState };
  },
});

export const pokerJoinLobbyTool = defineTool({
  name: 'poker_join_lobby',
  description: 'Dynamically seats an agent or human player at the poker table with their wallet / buy-in.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      player: { type: 'object' },
      id: { type: 'string' },
      name: { type: 'string' },
      instruction: { type: 'string' },
      persona: { type: 'string' },
      model: { type: 'string' },
      isHuman: { type: 'boolean' },
      wallet: { type: 'number' },
      buyIn: { type: 'number' },
      chips: { type: 'number' },
      seatIdx: { type: 'number' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    if (!rawState) throw new Error('poker_join_lobby: Game state not found.');

    const pData = args?.player || args;
    const id = String(pData.id || `player_${Date.now()}`);
    const name = String(pData.name || id);
    const isHuman: boolean = Boolean(pData.isHuman ?? (pData.persona === 'human' || id === 'hero'));
    const instruction = pData.instruction ? String(pData.instruction) : undefined;
    const persona = pData.persona ? String(pData.persona) : (isHuman ? 'human' : 'autonomous_agent');
    const model = pData.model ? String(pData.model) : undefined;
    const initialWallet = Number(pData.wallet ?? pData.startingWallet ?? pData.chips ?? rawState.startingChips ?? 1000);
    const chips = Number(pData.chips ?? pData.buyIn ?? Math.min(initialWallet, rawState.startingChips ?? 1000));

    // Check if already seated
    const existingIdx = rawState.players.findIndex((p) => p.id === id);
    if (existingIdx >= 0) {
      return { gameState: rawState, player: rawState.players[existingIdx], alreadySeated: true };
    }

    // Determine seat
    const maxSeats = rawState.maxSeats || 6;
    const occupiedSeats = new Set(rawState.players.map((p) => p.seatIdx));
    let seatIdx = pData.seatIdx !== undefined ? Number(pData.seatIdx) : -1;
    if (seatIdx < 0 || occupiedSeats.has(seatIdx)) {
      for (let s = 0; s < maxSeats; s++) {
        if (!occupiedSeats.has(s)) {
          seatIdx = s;
          break;
        }
      }
    }
    if (seatIdx < 0) {
      throw new Error(`poker_join_lobby: Table is full (${maxSeats} seats occupied).`);
    }

    const newPlayer: PlayerState = {
      id,
      name,
      isHuman,
      instruction,
      persona,
      model,
      wallet: initialWallet,
      buyIn: chips,
      chips,
      streetBet: 0,
      totalHandBet: 0,
      holeCards: [],
      folded: false,
      allIn: false,
      seatIdx,
    };

    const nextPlayers = [...rawState.players, newPlayer].sort((a, b) => a.seatIdx - b.seatIdx);

    // Register into startingWallets
    const startingWallets = { ...(rawState.startingWallets || {}) };
    if (startingWallets[newPlayer.id] === undefined) {
      startingWallets[newPlayer.id] = newPlayer.wallet ?? newPlayer.chips;
    }

    const joinRemark: AmbientRemark = {
      speakerId: 'dealer',
      speakerName: 'Dealer',
      speechAct: 'TABLE_TALK',
      text: `${name} joined the table at Seat #${seatIdx + 1} ($${chips} chips).`,
      timestamp: Date.now(),
    };

    const nextState: PokerGameState = {
      ...rawState,
      players: nextPlayers,
      startingWallets,
      recentRemarks: [...(rawState.recentRemarks || []), joinRemark].slice(-8),
      lastActionSummary: `${name} joined the game.`,
    };

    return { gameState: nextState, player: newPlayer };
  },
});

export const pokerLeaveLobbyTool = defineTool({
  name: 'poker_leave_lobby',
  description: 'Removes or cashes out a player from the poker table.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      id: { type: 'string' },
    },
    required: ['id'],
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || (ctx as any)?.state?.gameState || (ctx as any)?.context?.gameState) as PokerGameState;
    if (!rawState) throw new Error('poker_leave_lobby: Game state not found.');

    const id = args.id as string;
    const leavingPlayer = rawState.players.find((p) => p.id === id);
    if (!leavingPlayer) {
      return { gameState: rawState, left: false };
    }

    const nextPlayers = rawState.players.filter((p) => p.id !== id);

    const leaveRemark: AmbientRemark = {
      speakerId: 'dealer',
      speakerName: 'Dealer',
      speechAct: 'TABLE_TALK',
      text: `${leavingPlayer.name} cashed out $${leavingPlayer.chips} and left the table.`,
      timestamp: Date.now(),
    };

    const nextState: PokerGameState = {
      ...rawState,
      players: nextPlayers,
      recentRemarks: [...(rawState.recentRemarks || []), leaveRemark].slice(-8),
      lastActionSummary: `${leavingPlayer.name} left the game.`,
    };

    return { gameState: nextState, left: true, cashedOut: leavingPlayer.chips };
  },
});


export const pokerStartHandTool = defineTool({
  name: 'poker_start_hand',
  description: 'Starts a new hand: shuffles deck, posts blinds, deals hole cards.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const deck = createDeck();
    const handNumber = (rawState.handNumber || 0) + 1;
    const numPlayers = rawState.players.length;

    // Button rotates each hand: 0 -> 1 -> 2 -> 3 -> 0
    const buttonIdx = (rawState.buttonIdx + (handNumber === 1 ? 0 : 1)) % numPlayers;
    const sbIdx = (buttonIdx + 1) % numPlayers;
    const bbIdx = (buttonIdx + 2) % numPlayers;
    const utgIdx = (buttonIdx + 3) % numPlayers;

    // Reset players for new hand
    const players = rawState.players.map((p, idx) => ({
      ...p,
      streetBet: 0,
      totalHandBet: 0,
      holeCards: [deck.pop()!, deck.pop()!],
      folded: p.chips <= 0, // eliminated if zero chips
      allIn: false,
      seatIdx: idx,
    }));

    // Post Small Blind
    const sbPlayer = players[sbIdx];
    const sbPost = Math.min(sbPlayer.chips, rawState.sbAmount || 10);
    sbPlayer.chips -= sbPost;
    sbPlayer.streetBet = sbPost;
    sbPlayer.totalHandBet = sbPost;
    if (sbPlayer.chips === 0) sbPlayer.allIn = true;

    // Post Big Blind
    const bbPlayer = players[bbIdx];
    const bbPost = Math.min(bbPlayer.chips, rawState.bbAmount || 20);
    bbPlayer.chips -= bbPost;
    bbPlayer.streetBet = bbPost;
    bbPlayer.totalHandBet = bbPost;
    if (bbPlayer.chips === 0) bbPlayer.allIn = true;

    const pot = sbPost + bbPost;
    const currentBet = Math.max(sbPost, bbPost);

    const nextState: PokerGameState = {
      ...rawState,
      handNumber,
      buttonIdx,
      sbIdx,
      bbIdx,
      currentStreet: 'PREFLOP',
      board: [],
      deck,
      pot,
      sidePots: [],
      currentBet,
      minRaise: rawState.bbAmount || 20,
      activePlayerIdx: utgIdx,
      streetComplete: false,
      handOver: false,
      singleSurvivor: false,
      winnerIds: [],
      players,
      recentRemarks: [
        {
          speakerId: 'dealer',
          speakerName: 'Dealer',
          speechAct: 'TABLE_TALK',
          text: `Hand #${handNumber} dealt. ${players[buttonIdx].name} holds the Dealer button. Blinds posted ($${sbPost}/$${bbPost}).`,
          timestamp: Date.now(),
        },
      ],
      lastActionSummary: `Hand #${handNumber} started.`,
    };

    return { gameState: nextState };
  },
});

export const pokerAiDecisionTool = defineTool({
  name: 'poker_ai_decision',
  description: 'Calculates AI player action and ambient remark via Curator Agentic Engine.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      playerIdx: { type: 'number' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const idx = args?.playerIdx ?? rawState.activePlayerIdx;
    const player = rawState.players[idx];

    const action = await agenticDecidePokerAction(player, rawState);
    return { action };
  },
});

export const pokerApplyActionTool = defineTool({
  name: 'poker_apply_action',
  description: 'Applies player action (FOLD, CHECK, CALL, RAISE, ALL_IN) to table state.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      action: { type: 'object' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const action = (args?.action || ctx?.context?.lastAction || { type: 'CHECK' }) as PlayerAction;
    const idx = rawState.activePlayerIdx;
    const player = rawState.players[idx];

    let pot = rawState.pot;
    let currentBet = rawState.currentBet;
    let minRaise = rawState.minRaise;
    let actionDesc = '';

    const toCall = currentBet - player.streetBet;

    if (action.type === 'FOLD') {
      player.folded = true;
      actionDesc = `${player.name} folds.`;
    } else if (action.type === 'CHECK') {
      actionDesc = `${player.name} checks.`;
    } else if (action.type === 'CALL') {
      const callAmount = Math.min(player.chips, toCall);
      player.chips -= callAmount;
      player.streetBet += callAmount;
      player.totalHandBet += callAmount;
      pot += callAmount;
      if (player.chips === 0) player.allIn = true;
      actionDesc = `${player.name} calls $${callAmount}.`;
    } else if (action.type === 'RAISE') {
      const raiseAmt = action.amount || Math.min(player.chips, toCall + minRaise);
      const totalStreetWager = player.streetBet + raiseAmt;
      const amountToDeduct = Math.min(player.chips, raiseAmt);

      player.chips -= amountToDeduct;
      player.streetBet += amountToDeduct;
      player.totalHandBet += amountToDeduct;
      pot += amountToDeduct;

      if (player.streetBet > currentBet) {
        minRaise = player.streetBet - currentBet;
        currentBet = player.streetBet;
      }
      if (player.chips === 0) player.allIn = true;
      actionDesc = `${player.name} raises to $${currentBet}.`;
    } else if (action.type === 'ALL_IN') {
      const shoveAmt = player.chips;
      player.chips = 0;
      player.streetBet += shoveAmt;
      player.totalHandBet += shoveAmt;
      player.allIn = true;
      pot += shoveAmt;

      if (player.streetBet > currentBet) {
        minRaise = player.streetBet - currentBet;
        currentBet = player.streetBet;
      }
      actionDesc = `${player.name} goes ALL-IN for $${shoveAmt}!`;
    }

    // Generate potential ambient remark
    const remarks = [...(rawState.recentRemarks || [])];
    if (action.speech) {
      remarks.push({
        speakerId: player.id,
        speakerName: player.name,
        speechAct: action.speechAct || 'TABLE_TALK',
        recipientId: action.targetAgentId,
        text: action.speech,
        timestamp: Date.now(),
      });
    }
    // Keep only last 8 remarks for clean display
    const recentRemarks = remarks.slice(-8);

    // Check surviving active players
    const activeSurvivors = rawState.players.filter((p) => !p.folded);
    const handOver = activeSurvivors.length <= 1;
    const singleSurvivor = activeSurvivors.length === 1;

    // Check if betting is settled for this street
    const nonFolded = rawState.players.filter((p) => !p.folded);
    const nonAllIn = nonFolded.filter((p) => !p.allIn);
    const allBetsMatched = nonAllIn.every((p) => p.streetBet === currentBet);
    const allActed = nonAllIn.length <= 1 || allBetsMatched;

    // Move to next active player
    let nextIdx = (idx + 1) % rawState.players.length;
    let loopCount = 0;
    while ((rawState.players[nextIdx].folded || rawState.players[nextIdx].allIn) && loopCount < rawState.players.length) {
      nextIdx = (nextIdx + 1) % rawState.players.length;
      loopCount++;
    }

    const nextState: PokerGameState = {
      ...rawState,
      pot,
      currentBet,
      minRaise,
      activePlayerIdx: nextIdx,
      streetComplete: allActed && !handOver,
      handOver,
      singleSurvivor,
      winnerIds: singleSurvivor ? [activeSurvivors[0].id] : [],
      players: rawState.players,
      recentRemarks,
      lastActionSummary: actionDesc,
    };

    if (action.innerMonologue) {
      player.lastMonologue = action.innerMonologue;
    }

    return { gameState: nextState };
  },
});

export const pokerDealStreetTool = defineTool({
  name: 'poker_deal_street',
  description: 'Deals next street community cards (FLOP, TURN, RIVER) and resets street wagering.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const deck = [...rawState.deck];
    const board = [...rawState.board];

    let nextStreet = rawState.currentStreet;
    let streetName = '';

    if (rawState.currentStreet === 'PREFLOP') {
      nextStreet = 'FLOP';
      deck.pop(); // Burn 1
      board.push(deck.pop()!, deck.pop()!, deck.pop()!);
      streetName = 'FLOP';
    } else if (rawState.currentStreet === 'FLOP') {
      nextStreet = 'TURN';
      deck.pop(); // Burn 1
      board.push(deck.pop()!);
      streetName = 'TURN';
    } else if (rawState.currentStreet === 'TURN') {
      nextStreet = 'RIVER';
      deck.pop(); // Burn 1
      board.push(deck.pop()!);
      streetName = 'RIVER';
    } else if (rawState.currentStreet === 'RIVER') {
      nextStreet = 'SHOWDOWN';
      streetName = 'SHOWDOWN';
    }

    // Reset street bets for new street
    const players = rawState.players.map((p) => ({ ...p, streetBet: 0 }));

    // Action starts left of the button
    let nextIdx = (rawState.buttonIdx + 1) % players.length;
    let loopCount = 0;
    while ((players[nextIdx].folded || players[nextIdx].allIn) && loopCount < players.length) {
      nextIdx = (nextIdx + 1) % players.length;
      loopCount++;
    }

    const remarks = [...(rawState.recentRemarks || [])];
    remarks.push({
      speakerId: 'dealer',
      speakerName: 'Dealer',
      speechAct: 'TABLE_TALK',
      text: `${streetName} dealt: [${board.map((c) => `${c.rank}${c.suit}`).join(' ')}]. Pot: $${rawState.pot}.`,
      timestamp: Date.now(),
    });

    const nextState: PokerGameState = {
      ...rawState,
      deck,
      board,
      currentStreet: nextStreet,
      currentBet: 0,
      minRaise: rawState.bbAmount || 20,
      activePlayerIdx: nextIdx,
      streetComplete: false,
      players,
      recentRemarks: remarks.slice(-8),
      lastActionSummary: `Dealt ${streetName}.`,
    };

    return { gameState: nextState };
  },
});

export const pokerFastForwardBoardTool = defineTool({
  name: 'poker_fast_forward_board',
  description: 'Deals all remaining board cards when players are all-in.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const deck = [...rawState.deck];
    const board = [...rawState.board];

    while (board.length < 5 && deck.length > 0) {
      deck.pop(); // burn
      board.push(deck.pop()!);
    }

    const nextState: PokerGameState = {
      ...rawState,
      deck,
      board,
      currentStreet: 'SHOWDOWN',
      streetComplete: true,
      lastActionSummary: 'All-in runout complete.',
    };

    return { gameState: nextState };
  },
});

export const pokerDistributePotsTool = defineTool({
  name: 'poker_distribute_pots',
  description: 'Adjudicates showdown hands, allocates main and side pots, and settles chip counts.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const players = rawState.players;
    const eligiblePlayers = players.filter((p) => !p.folded);

    let winnerSummary = '';
    const winnerIds: string[] = [];

    if (rawState.singleSurvivor) {
      const winner = eligiblePlayers[0];
      winner.chips += rawState.pot;
      winnerIds.push(winner.id);
      winnerSummary = `${winner.name} wins $${rawState.pot} (everyone else folded).`;
    } else {
      // Showdown evaluation
      const evaluated = eligiblePlayers.map((p) => {
        const evalHand = evaluateBestHand(p.holeCards, rawState.board);
        return { player: p, evalHand };
      });

      // Sort descending by score
      evaluated.sort((a, b) => b.evalHand.score - a.evalHand.score);
      const topScore = evaluated[0].evalHand.score;
      const winners = evaluated.filter((e) => e.evalHand.score === topScore);

      const splitPot = Math.floor(rawState.pot / winners.length);
      for (const w of winners) {
        w.player.chips += splitPot;
        winnerIds.push(w.player.id);
      }

      const winnerNames = winners.map((w) => `${w.player.name} (${w.evalHand.description})`).join(' and ');
      winnerSummary = `${winnerNames} win${winners.length > 1 ? '' : 's'} $${rawState.pot}!`;
    }

    const remarks = [...(rawState.recentRemarks || [])];
    remarks.push({
      speakerId: 'dealer',
      speakerName: 'Dealer',
      speechAct: 'TABLE_TALK',
      text: `Showdown complete: ${winnerSummary}`,
      timestamp: Date.now(),
    });

    const nextState: PokerGameState = {
      ...rawState,
      pot: 0,
      handOver: true,
      winnerIds,
      players,
      recentRemarks: remarks.slice(-8),
      lastActionSummary: winnerSummary,
    };

    return { gameState: nextState, winnerSummary };
  },
});

export const pokerRotateDealerTool = defineTool({
  name: 'poker_rotate_dealer',
  description: 'Rotates dealer button to next active seat.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const nextBtn = (rawState.buttonIdx + 1) % rawState.players.length;
    return { gameState: { ...rawState, buttonIdx: nextBtn } };
  },
});

export const pokerHumanSpeechTool = defineTool({
  name: 'poker_human_speech',
  description: 'Applies human table talk, banter, or private whisper to the table and triggers AI persona reactions.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
      speechAct: { type: 'string', enum: ['TABLE_TALK', 'BANTER', 'WHISPER', 'PROVOKE'] },
      text: { type: 'string' },
      targetId: { type: 'string' },
    },
    required: ['speechAct', 'text'],
  },
  execute: async (args: any, ctx: any) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    const speechAct = (args.speechAct || 'TABLE_TALK') as SpeechAct;
    const text = String(args.text || '');
    const targetId = args.targetId ? String(args.targetId) : undefined;

    const remarks = [...(rawState.recentRemarks || [])];

    // Add speaker's remark
    const speakerId = args.speakerId || 'hero';
    const speakerPlayer = rawState.players.find((p) => p.id === speakerId);
    const speakerName = args.speakerName || speakerPlayer?.name || 'You (Hero)';

    const remark: AmbientRemark = {
      speakerId,
      speakerName,
      speechAct,
      recipientId: targetId,
      text,
      timestamp: Date.now(),
    };
    remarks.push(remark);

    // AI reacts via Curator LLM pipeline if targeted or addressed
    let aiResponse: AmbientRemark | null = null;
    const targetPlayer = rawState.players.find((p) => p.id === targetId && !p.isHuman);
    const respondingAgent = targetPlayer || (speechAct !== 'WHISPER' ? rawState.players.find((p) => !p.isHuman && !p.folded) : null);

    if (respondingAgent) {
      const isWhisperToAgent = speechAct === 'WHISPER' && targetId === respondingAgent.id;
      const systemPrompt = buildAgentSystemPrompt(respondingAgent);
      const userPrompt = `Discourse Event: ${speakerName} stated (${speechAct}): "${text}". Respond in character as ${respondingAgent.name} in JSON: {"speech": "your reply", "speechAct": "${isWhisperToAgent ? 'WHISPER' : 'TABLE_TALK'}", "innerMonologue": "reasoning"}`;

      const res = await callCuratorLlm<{ speech?: string; speechAct?: SpeechAct; innerMonologue?: string }>(
        systemPrompt,
        userPrompt,
        { model: respondingAgent.model }
      );

      if (res?.speech) {
        aiResponse = {
          speakerId: respondingAgent.id,
          speakerName: respondingAgent.name,
          speechAct: res.speechAct || (isWhisperToAgent ? 'WHISPER' : 'TABLE_TALK'),
          recipientId: isWhisperToAgent ? speakerId : undefined,
          text: res.speech,
          timestamp: Date.now(),
        };
        remarks.push(aiResponse);
      }
    }

    const nextState: PokerGameState = {
      ...rawState,
      recentRemarks: remarks.slice(-8),
    };

    return { gameState: nextState, remark, aiResponse };
  },
});

export const pokerCheckGameOverTool = defineTool({
  name: 'poker_check_game_over',
  description: 'Checks if table is down to 1 solvent player or reached max hands, compiling final standings.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    if (!rawState) throw new Error('poker_check_game_over: Game state not found.');

    const solventPlayers = rawState.players.filter((p) => p.chips > 0);
    const maxHandsReached = rawState.maxHands !== undefined && rawState.handNumber >= rawState.maxHands;
    const gameOver = solventPlayers.length <= 1 || maxHandsReached;

    const startingWallets = rawState.startingWallets || {};
    const standings: PlayerStanding[] = rawState.players.map((p) => {
      const start = startingWallets[p.id] ?? (rawState.startingChips || 1000);
      const finalChips = p.chips;
      const net = finalChips - start;
      let status: PlayerStanding['status'] = 'Active';
      if (finalChips === 0) status = 'Bust';
      else if (solventPlayers.length === 1 && solventPlayers[0].id === p.id) status = 'Winner';
      return {
        rank: 0,
        id: p.id,
        name: p.name,
        startChips: start,
        finalChips,
        net,
        status,
      };
    });

    standings.sort((a, b) => b.finalChips - a.finalChips);
    standings.forEach((s, idx) => { s.rank = idx + 1; });

    let report = '\n--- FINAL STANDINGS ---\n';
    for (const s of standings) {
      const netStr = s.net >= 0 ? `+${s.net}` : `${s.net}`;
      const statusStr = s.status !== 'Active' ? ` [${s.status}]` : '';
      report += ` Rank ${s.rank}: ${s.name} (Start: ${s.startChips}, Final: ${s.finalChips}, Net: ${netStr})${statusStr}\n`;
    }

    const nextState: PokerGameState = {
      ...rawState,
      gameOver,
      finalStandings: standings,
    };

    return {
      gameOver,
      result: gameOver ? 'GAME_OVER' : 'CONTINUE',
      standings,
      report,
      winner: solventPlayers[0]?.name || 'None',
      gameState: nextState,
    };
  },
});

export const pokerGetStandingsTool = defineTool({
  name: 'poker_get_standings',
  description: 'Returns the current session standings and chip profit/loss report.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'object' },
    },
  },
  execute: async (args, ctx) => {
    const rawState = (args?.state || ctx?.state?.gameState || ctx?.context?.gameState) as PokerGameState;
    if (!rawState) throw new Error('poker_get_standings: Game state not found.');

    const startingWallets = rawState.startingWallets || {};
    const standings: PlayerStanding[] = rawState.players.map((p) => {
      const start = startingWallets[p.id] ?? (rawState.startingChips || 1000);
      const finalChips = p.chips;
      const net = finalChips - start;
      return {
        rank: 0,
        id: p.id,
        name: p.name,
        startChips: start,
        finalChips,
        net,
        status: finalChips === 0 ? 'Bust' : 'Active',
      };
    });
    standings.sort((a, b) => b.finalChips - a.finalChips);
    standings.forEach((s, idx) => { s.rank = idx + 1; });
    return { standings };
  },
});

export const pokerPlugin: CuratorPlugin = {
  name: 'minigame:poker',
  version: '2.0.0',
  description: 'Curator Texas Holdem Engine with Autonomous Agent Flow, Side Pots, and Dual-Track Ambient Dialogue',
  tools: {
    poker_init_lobby: pokerInitLobbyTool,
    poker_join_lobby: pokerJoinLobbyTool,
    poker_leave_lobby: pokerLeaveLobbyTool,
    poker_start_hand: pokerStartHandTool,
    poker_ai_decision: pokerAiDecisionTool,
    poker_apply_action: pokerApplyActionTool,
    poker_deal_street: pokerDealStreetTool,
    poker_fast_forward_board: pokerFastForwardBoardTool,
    poker_distribute_pots: pokerDistributePotsTool,
    poker_rotate_dealer: pokerRotateDealerTool,
    poker_human_speech: pokerHumanSpeechTool,
    poker_check_game_over: pokerCheckGameOverTool,
    poker_get_standings: pokerGetStandingsTool,
  },
  scripts: {
    poker_workflow: {
      name: 'poker_workflow',
      description: 'Curator Texas Hold\'em Autonomous Event-Driven 5-Phase Game Loop',
      body: loadCoffeeScript('poker_workflow.coffee'),
      run: async () => {},
    },
    poker_lobby: {
      name: 'poker_lobby',
      description: 'Poker Lobby Workflow for Table Initialization & Dynamic Seating',
      body: loadCoffeeScript('poker_lobby.coffee'),
      run: async () => {},
    },
    human_turn: {
      name: 'human_turn',
      description: 'Human Player Turn Workflow with Awaiting Events & Action Dispatch',
      body: loadCoffeeScript('human_turn.coffee'),
      run: async () => {},
    },
    agent_turn: {
      name: 'agent_turn',
      description: 'Autonomous Player Agent Turn Workflow using seated agent instruction & prompt',
      body: loadCoffeeScript('agent_turn.coffee'),
      run: async () => {},
    },
    poker_action: {
      name: 'poker_action',
      description: 'Poker Action Application & State Update Workflow',
      body: loadCoffeeScript('poker_action.coffee'),
      run: async () => {},
    },
    ambient_reaction: {
      name: 'ambient_reaction',
      description: 'Ambient Reaction & Table Talk Event Workflow',
      body: loadCoffeeScript('ambient_reaction.coffee'),
      run: async () => {},
    },
  },
};
