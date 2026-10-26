import {
  PokerStandingStatus,
  type PokerStandingStatusType,
  PokerGameOverResult,
  type PokerGameOverResultType,
  type Card,
  type PlayerState,
  type PokerGameState,
  type PlayerAction,
  type PlayerStanding,
  type Street,
} from '../types.ts';
import { evaluateBestHand } from './pokerEvaluator.ts';
import { createStandardDeck } from '../deck/index.ts';

import {
  tableRules,
  getLegalChoices as calculateLegalChoices,
  type TableRulesDefinition,
} from './pokerRules.ts';
import { DEFAULT_TABLE_PLAYERS } from '../workflows/agentProfiles.ts';
import { PokerActionType, PokerStreet } from '../models/pokerContracts.ts';

export function getTableRules(): TableRulesDefinition {
  return tableRules;
}

export interface PlayerChoice {
  id: string;
  label: string;
  action: PlayerAction;
}

export function getLegalChoices(gameState: PokerGameState, playerIdx?: number): PlayerChoice[] {
  if (!gameState || !Array.isArray(gameState.players)) return [];
  const idx = playerIdx !== undefined ? playerIdx : gameState.activePlayerIdx;
  const player = gameState.players[idx];
  if (!player) return [];
  const toCall = Math.max(0, (gameState.currentBet || 0) - (player.streetBet || 0));
  return calculateLegalChoices(toCall, player.chips || 0, gameState.minRaise || 20, gameState.currentBet || 0);
}

export function createDeck(): Card[] {
  const rules = getTableRules();
  return createStandardDeck({
    suits: rules.deck?.suits,
    ranks: rules.deck?.ranks,
    shuffle: true,
  });
}

export function sliceSidePots(players: PlayerState[]): { mainPot: number; sidePots: { amount: number; eligiblePlayerIds: string[] }[] } {
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

export function initPokerLobby(args?: any): { gameState: PokerGameState } {
  const rules = getTableRules();
  const startingChips = (args?.startingChips as number) || rules.startingChips || 1000;
  const maxSeats = (args?.maxSeats as number) || rules.maxSeats || 6;
  const sbAmount = (args?.sbAmount as number) || (args?.smallBlind as number) || rules.blinds?.smallBlind || 10;
  const bbAmount = (args?.bbAmount as number) || (args?.bigBlind as number) || rules.blinds?.bigBlind || 20;
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
        name: p.name || p.id,
        isHuman: Boolean(p.isHuman),
        instruction: p.instruction,
        provider: p.provider,
        persona: p.persona,
        model: p.model,
        wallet,
        buyIn: chips,
        chips,
        streetBet: 0,
        totalHandBet: 0,
        holeCards: [],
        folded: false,
        allIn: false,
        hasActedThisStreet: false,
        seatIdx: p.seatIdx !== undefined ? p.seatIdx : idx,
      };
    });
  } else {
    players = DEFAULT_TABLE_PLAYERS.map((profile, idx) => ({
      id: profile.id,
      name: profile.isHuman ? (args?.playerName || 'You') : profile.name,
      isHuman: Boolean(profile.isHuman),
      instruction: profile.instruction,
      persona: profile.persona,
      wallet: startingChips,
      buyIn: startingChips,
      chips: startingChips,
      streetBet: 0,
      totalHandBet: 0,
      holeCards: [],
      folded: false,
      allIn: false,
      hasActedThisStreet: false,
      seatIdx: idx,
    }));
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
    currentStreet: PokerStreet.PREFLOP,
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
    maxSeats,
    startingChips,
    startingWallets,
    revealHandsOnSettle,
    maxHands,
  };

  return { gameState };
}

export function joinPokerLobby(rawState: PokerGameState, pData: any): { gameState: PokerGameState; player: PlayerState; alreadySeated?: boolean } {
  if (!rawState) throw new Error('joinPokerLobby: Game state not found.');

  const id = String(pData.id || `player_${Date.now()}`);
  const name = String(pData.name || id);
  const isHuman = Boolean(pData.isHuman);
  const instruction = pData.instruction ? String(pData.instruction) : undefined;
  const persona = pData.persona ? String(pData.persona) : undefined;
  const model = pData.model ? String(pData.model) : undefined;
  const initialWallet = Number(pData.wallet ?? pData.startingWallet ?? pData.chips ?? rawState.startingChips ?? 1000);
  const chips = Number(pData.chips ?? pData.buyIn ?? Math.min(initialWallet, rawState.startingChips ?? 1000));

  const existingIdx = rawState.players.findIndex((p) => p.id === id);
  if (existingIdx >= 0) {
    return { gameState: rawState, player: rawState.players[existingIdx], alreadySeated: true };
  }

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
    throw new Error(`joinPokerLobby: Table is full (${maxSeats} seats occupied).`);
  }

  const newPlayer: PlayerState = {
    id,
    name,
    isHuman,
    instruction,
    provider: pData.provider ? String(pData.provider) : undefined,
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
  const startingWallets = { ...(rawState.startingWallets || {}) };
  if (startingWallets[newPlayer.id] === undefined) {
    startingWallets[newPlayer.id] = newPlayer.wallet ?? newPlayer.chips;
  }

  const nextState: PokerGameState = {
    ...rawState,
    players: nextPlayers,
    startingWallets,
    lastActionSummary: `${name} joined the game.`,
  };

  return { gameState: nextState, player: newPlayer };
}

export function leavePokerLobby(rawState: PokerGameState, id: string): { gameState: PokerGameState; left: boolean; cashedOut?: number } {
  if (!rawState) throw new Error('leavePokerLobby: Game state not found.');

  const leavingPlayer = rawState.players.find((p) => p.id === id);
  if (!leavingPlayer) {
    return { gameState: rawState, left: false };
  }

  const nextPlayers = rawState.players.filter((p) => p.id !== id);

  const nextState: PokerGameState = {
    ...rawState,
    players: nextPlayers,
    lastActionSummary: `${leavingPlayer.name} left the game.`,
  };

  return { gameState: nextState, left: true, cashedOut: leavingPlayer.chips };
}

export function startPokerHand(rawState: PokerGameState): { gameState: PokerGameState } {
  const deck = createDeck();
  const handNumber = (rawState.handNumber || 0) + 1;
  const numPlayers = rawState.players.length;

  const buttonIdx = (rawState.buttonIdx || 0) % numPlayers;

  const getNextSeated = (fromIdx: number): number => {
    for (let offset = 1; offset <= numPlayers; offset++) {
      const next = (fromIdx + offset) % numPlayers;
      if (rawState.players[next].chips > 0) {
        return next;
      }
    }
    return fromIdx;
  };

  const sbIdx = getNextSeated(buttonIdx);
  const bbIdx = getNextSeated(sbIdx);
  const utgIdx = getNextSeated(bbIdx);

  const players = rawState.players.map((p, idx) => ({
    ...p,
    streetBet: 0,
    totalHandBet: 0,
    holeCards: [deck.pop()!, deck.pop()!],
    folded: p.chips <= 0,
    allIn: false,
    hasActedThisStreet: false,
    seatIdx: idx,
  }));

  const postBlind = (player: PlayerState, amount: number) => {
    const post = Math.min(player.chips, amount);
    player.chips -= post;
    player.streetBet = post;
    player.totalHandBet = post;
    if (player.chips === 0) player.allIn = true;
    return post;
  };

  const sbPost = postBlind(players[sbIdx], rawState.sbAmount || 10);
  const bbPost = postBlind(players[bbIdx], rawState.bbAmount || 20);

  const pot = sbPost + bbPost;
  const currentBet = Math.max(sbPost, bbPost);

  const nextState: PokerGameState = {
    ...rawState,
    handNumber,
    buttonIdx,
    sbIdx,
    bbIdx,
    currentStreet: PokerStreet.PREFLOP,
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
    lastActionSummary: `Hand #${handNumber} started.`,
  };

  return { gameState: nextState };
}

function getNextActivePlayerIdx(players: PlayerState[], startIdx: number): number {
  for (let offset = 1; offset <= players.length; offset++) {
    const next = (startIdx + offset) % players.length;
    if (!players[next].folded && !players[next].allIn) {
      return next;
    }
  }
  return startIdx;
}

export function applyPokerAction(rawState: PokerGameState, action: PlayerAction): { gameState: PokerGameState } {
  if (!rawState) throw new Error('applyPokerAction: Game state not found.');

  const idx = rawState.activePlayerIdx;
  const players = rawState.players.map((p, i) => (i === idx ? { ...p } : p));
  const player = players[idx];

  let pot = rawState.pot;
  let currentBet = rawState.currentBet;
  let minRaise = rawState.minRaise;
  const oldBet = currentBet;

  player.hasActedThisStreet = true;

  const toCall = Math.max(0, currentBet - player.streetBet);

  const commitWager = (amount: number): number => {
    const commit = Math.min(player.chips, Math.max(0, amount));
    player.chips -= commit;
    player.streetBet += commit;
    player.totalHandBet += commit;
    pot += commit;

    if (player.streetBet > currentBet) {
      minRaise = player.streetBet - currentBet;
      currentBet = player.streetBet;
    }
    if (player.chips === 0) {
      player.allIn = true;
    }
    return commit;
  };

  const ACTIONS: Record<string, () => string> = {
    [PokerActionType.FOLD]: () => {
      player.folded = true;
      return `${player.name} folds.`;
    },
    [PokerActionType.CHECK]: () => `${player.name} checks.`,
    [PokerActionType.CALL]: () => {
      const commit = commitWager(toCall);
      return commit === 0 ? `${player.name} checks.` : `${player.name} calls $${commit}.`;
    },
    [PokerActionType.RAISE]: () => {
      commitWager(action.amount ?? (toCall + minRaise));
      return `${player.name} raises to $${currentBet}.`;
    },
    [PokerActionType.ALL_IN]: () => {
      player.allIn = true;
      return `${player.name} goes ALL-IN for $${commitWager(player.chips)}!`;
    },
  };

  const actionDesc = (ACTIONS[action.type] ?? (() => `${player.name} acts (${action.type}).`))();

  // If a bet or raise occurred, reset hasActedThisStreet for all other active non-all-in players
  if (currentBet > oldBet) {
    for (let i = 0; i < players.length; i++) {
      if (i !== idx && !players[i].folded && !players[i].allIn) {
        players[i].hasActedThisStreet = false;
      }
    }
  }

  const activeSurvivors = players.filter((p) => !p.folded);
  const singleSurvivor = activeSurvivors.length === 1;
  const handOver = activeSurvivors.length <= 1;

  const nonAllIn = activeSurvivors.filter((p) => !p.allIn);
  const allBetsMatched = nonAllIn.every((p) => p.streetBet === currentBet);
  const allActed = nonAllIn.every((p) => Boolean(p.hasActedThisStreet));

  let streetComplete = false;
  if (handOver) {
    streetComplete = true;
  } else if (nonAllIn.length <= 1) {
    streetComplete = allBetsMatched && (nonAllIn.length === 0 || allActed);
  } else {
    streetComplete = allActed && allBetsMatched;
  }

  const nextState: PokerGameState = {
    ...rawState,
    pot,
    currentBet,
    minRaise,
    activePlayerIdx: getNextActivePlayerIdx(players, idx),
    streetComplete,
    handOver,
    singleSurvivor,
    winnerIds: singleSurvivor ? [activeSurvivors[0].id] : [],
    players,
    lastActorId: player.id,
    lastActorName: player.name,
    lastActionType: action.type,
    lastActionAmount: action.amount,
    lastActionSummary: actionDesc,
  };

  return { gameState: nextState };
}

const STREET_TRANSITIONS: Record<Street, { next: Street; cards: number }> = {
  [PokerStreet.PREFLOP]: { next: PokerStreet.FLOP, cards: 3 },
  [PokerStreet.FLOP]: { next: PokerStreet.TURN, cards: 1 },
  [PokerStreet.TURN]: { next: PokerStreet.RIVER, cards: 1 },
  [PokerStreet.RIVER]: { next: PokerStreet.SHOWDOWN, cards: 0 },
  [PokerStreet.SHOWDOWN]: { next: PokerStreet.SHOWDOWN, cards: 0 },
};

export function dealPokerStreet(rawState: PokerGameState): { gameState: PokerGameState } {
  const deck = [...rawState.deck];
  const board = [...rawState.board];

  const trans = STREET_TRANSITIONS[rawState.currentStreet] ?? { next: rawState.currentStreet, cards: 0 };
  const nextStreet = trans.next;
  if (trans.cards > 0) {
    deck.pop(); // Burn card
    for (let i = 0; i < trans.cards; i++) {
      board.push(deck.pop()!);
    }
  }

  const players = rawState.players.map((p) => ({
    ...p,
    streetBet: 0,
    hasActedThisStreet: false,
  }));

  const nextState: PokerGameState = {
    ...rawState,
    deck,
    board,
    currentStreet: nextStreet,
    currentBet: 0,
    minRaise: rawState.bbAmount || 20,
    activePlayerIdx: getNextActivePlayerIdx(players, rawState.buttonIdx),
    streetComplete: false,
    players,
    lastActionSummary: `Dealt ${nextStreet}.`,
  };

  return { gameState: nextState };
}

export function fastForwardPokerBoard(rawState: PokerGameState): { gameState: PokerGameState } {
  const deck = [...rawState.deck];
  const board = [...rawState.board];

  while (board.length < 5 && deck.length > 0) {
    deck.pop();
    board.push(deck.pop()!);
  }

  const nextState: PokerGameState = {
    ...rawState,
    deck,
    board,
    currentStreet: PokerStreet.SHOWDOWN,
    streetComplete: true,
    lastActionSummary: 'All-in runout complete.',
  };

  return { gameState: nextState };
}

export function distributePokerPots(rawState: PokerGameState): { gameState: PokerGameState; winnerSummary: string } {
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
    const evaluated = eligiblePlayers.map((p) => {
      const evalHand = evaluateBestHand(p.holeCards, rawState.board);
      return { player: p, evalHand };
    });

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

  const nextState: PokerGameState = {
    ...rawState,
    pot: 0,
    handOver: true,
    winnerIds,
    players,
    lastActionSummary: winnerSummary,
  };

  return { gameState: nextState, winnerSummary };
}

export function rotatePokerDealer(rawState: PokerGameState): { gameState: PokerGameState } {
  const nextBtn = (rawState.buttonIdx + 1) % rawState.players.length;
  return { gameState: { ...rawState, buttonIdx: nextBtn } };
}

export function calculateStandings(rawState: PokerGameState, winnerId?: string): PlayerStanding[] {
  const startingWallets = rawState.startingWallets || {};
  const standings: PlayerStanding[] = rawState.players.map((p) => {
    const start = startingWallets[p.id] ?? (rawState.startingChips || 1000);
    const finalChips = p.chips;
    const net = finalChips - start;
    let status: PokerStandingStatusType = PokerStandingStatus.ACTIVE;
    if (finalChips === 0) status = PokerStandingStatus.BUST;
    else if (winnerId && winnerId === p.id) status = PokerStandingStatus.WINNER;
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
  return standings;
}

export function checkPokerGameOver(rawState: PokerGameState): {
  gameOver: boolean;
  result: PokerGameOverResultType;
  standings: PlayerStanding[];
  report: string;
  winner: string;
  gameState: PokerGameState;
} {
  if (!rawState) throw new Error('checkPokerGameOver: Game state not found.');

  const solventPlayers = rawState.players.filter((p) => p.chips > 0);
  const maxHandsReached = rawState.maxHands !== undefined && rawState.handNumber >= rawState.maxHands;
  const gameOver = solventPlayers.length <= 1 || maxHandsReached;

  const winnerId = solventPlayers.length === 1 ? solventPlayers[0].id : undefined;
  const standings = calculateStandings(rawState, winnerId);

  let report = '\n--- FINAL STANDINGS ---\n';
  for (const s of standings) {
    const netStr = s.net >= 0 ? `+${s.net}` : `${s.net}`;
    const statusStr = s.status !== PokerStandingStatus.ACTIVE ? ` [${s.status}]` : '';
    report += ` Rank ${s.rank}: ${s.name} (Start: ${s.startChips}, Final: ${s.finalChips}, Net: ${netStr})${statusStr}\n`;
  }

  const nextState: PokerGameState = {
    ...rawState,
    gameOver,
    finalStandings: standings,
  };

  return {
    gameOver,
    result: gameOver ? PokerGameOverResult.GAME_OVER : PokerGameOverResult.CONTINUE,
    standings,
    report,
    winner: solventPlayers[0]?.name || 'None',
    gameState: nextState,
  };
}

export function getPokerStandings(rawState: PokerGameState): { standings: PlayerStanding[] } {
  if (!rawState) throw new Error('getPokerStandings: Game state not found.');
  return { standings: calculateStandings(rawState) };
}
