import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type {
  Card,
  PlayerState,
  PokerGameState,
  Rank,
  Suit,
  PlayerAction,
  SpeechAct,
  AmbientRemark,
  PlayerStanding,
  ActionType,
} from '../types.ts';
import { evaluateBestHand } from './pokerEvaluator.ts';
import { curatorEngine, LlmFactory, GeminiLlmProvider } from '../curator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPTS_DIR = path.resolve(__dirname, '../scripts');
const require = createRequire(import.meta.url);

let cachedCoffee: any = null;
function getCoffee(): any {
  if (cachedCoffee) return cachedCoffee;
  try {
    cachedCoffee = require('coffeescript');
  } catch {
    cachedCoffee = require('../../../../curator/node_modules/coffeescript');
  }
  return cachedCoffee;
}

let cachedRules: any = null;
export function getPokerRules(): any {
  if (cachedRules) return cachedRules;
  const filePath = path.join(SCRIPTS_DIR, 'poker_rules.coffee');
  const code = fs.readFileSync(filePath, 'utf-8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?|^#\s*---\r?\n[\s\S]*?\r?\n#\s*---\r?\n?/, '');
  const js = getCoffee().compile(code, { bare: true, header: false });
  const mod = { exports: {} as any };
  const fn = new Function('module', 'exports', js);
  fn(mod, mod.exports);
  cachedRules = mod.exports?.default || mod.exports;
  return cachedRules;
}

let cachedPromptBuilder: any = null;
export function formatAgentPromptCoffeeScript(params: any): any {
  if (!cachedPromptBuilder) {
    const filePath = path.join(SCRIPTS_DIR, 'agent_prompt.coffee');
    const code = fs.readFileSync(filePath, 'utf-8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?|^#\s*---\r?\n[\s\S]*?\r?\n#\s*---\r?\n?/, '');
    const js = getCoffee().compile(code, { bare: true, header: false });
    const mod = { exports: {} as any };
    const fn = new Function('module', 'exports', js);
    fn(mod, mod.exports);
    cachedPromptBuilder = mod.exports?.default || mod.exports;
  }
  const rules = getPokerRules();
  const rulesDescription = rules?.getRulesDescription ? rules.getRulesDescription() : undefined;
  const enriched = typeof params === 'object' && params !== null ? { rulesDescription, ...params } : params;
  return cachedPromptBuilder(enriched);
}

export function getTableRules(): any {
  return getPokerRules()?.tableRules || {};
}

export interface PlayerChoice {
  id: string;
  label: string;
  action: PlayerAction;
}

export function getLegalChoices(gameState: PokerGameState, playerIdx?: number): PlayerChoice[] {
  const idx = playerIdx !== undefined ? playerIdx : gameState.activePlayerIdx;
  const player = gameState.players[idx];
  if (!player) return [];
  const toCall = gameState.currentBet - player.streetBet;
  const rules = getPokerRules();
  if (rules?.getLegalChoices) {
    return rules.getLegalChoices(toCall, player.chips, gameState.minRaise || 20, gameState.currentBet);
  }
  const choices: PlayerChoice[] = [];
  if (toCall === 0) {
    choices.push({ id: 'check', label: 'Check', action: { type: 'CHECK' } });
    if (player.chips >= 40) choices.push({ id: 'bet_40', label: 'Bet $40', action: { type: 'RAISE', amount: 40 } });
    if (player.chips >= 100) choices.push({ id: 'bet_100', label: 'Bet $100', action: { type: 'RAISE', amount: 100 } });
    choices.push({ id: 'all_in', label: `All-In ($${player.chips})`, action: { type: 'ALL_IN', amount: player.chips } });
  } else {
    choices.push({ id: 'call', label: `Call $${toCall}`, action: { type: 'CALL', amount: toCall } });
    choices.push({ id: 'raise', label: `Raise to $${gameState.currentBet + 40}`, action: { type: 'RAISE', amount: toCall + 40 } });
    choices.push({ id: 'all_in', label: `All-In ($${player.chips})`, action: { type: 'ALL_IN', amount: player.chips } });
    choices.push({ id: 'fold', label: 'Fold', action: { type: 'FOLD' } });
  }
  return choices;
}

export function createDeck(): Card[] {
  const rules = getTableRules();
  const suits: Suit[] = rules.deck?.suits || ['♠', '♥', '♦', '♣'];
  const ranks: Rank[] = rules.deck?.ranks || ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
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

export function formatCards(cards: Card[]): string {
  return cards.map((c) => `[${c.rank}${c.suit}]`).join(' ');
}

export function getAgentInstruction(agent: PlayerState): string {
  if (agent.instruction && agent.instruction.trim().length > 0) {
    return agent.instruction;
  }
  if (agent.persona && typeof agent.persona === 'string') {
    return `You are ${agent.name}, an autonomous poker agent. Character disposition: ${agent.persona}.`;
  }
  return `You are ${agent.name}, an autonomous poker player aiming to maximize chips through strategic analysis and game theory.`;
}

export function buildAgentSystemPrompt(player: PlayerState): string {
  return formatAgentPromptCoffeeScript(player);
}

export async function generateAgentLlmContent<T = any>(
  systemPrompt: string,
  userPrompt: string,
  options: { model?: string; provider?: string; temperature?: number; maxTokens?: number } = {}
): Promise<T | null> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      LlmFactory.getProvider('gemini');
    } catch {
      LlmFactory.registerProvider('gemini', new GeminiLlmProvider());
    }
  }

  try {
    const response = await curatorEngine.generateContent({
      provider: options.provider || 'gemini',
      model: options.model || 'gemini-2.5-flash',
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      jsonOutput: true,
      apiKey: apiKey || 'curator-local-key',
      temperature: options.temperature ?? 0.8,
      maxTokens: options.maxTokens ?? 350,
    });

    if (!response?.text) return null;
    return JSON.parse(response.text) as T;
  } catch {
    return null;
  }
}

export const callCuratorLlm = generateAgentLlmContent;

export async function agenticDecidePokerAction(
  player: PlayerState,
  gameState: PokerGameState
): Promise<PlayerAction> {
  const toCall = Math.max(0, gameState.currentBet - player.streetBet);
  const canCheck = toCall === 0;
  const handEval = evaluateBestHand(player.holeCards, gameState.board);
  const chips = player.chips;
  const minRaise = gameState.minRaise || 20;

  const { systemPrompt, userPrompt } = formatAgentPromptCoffeeScript({
    player,
    gameState,
    handDesc: handEval.description,
    cardsStr: formatCards(player.holeCards),
    boardStr: formatCards(gameState.board) || 'None',
  });

  const res = await generateAgentLlmContent<{
    action: string;
    amount?: number;
    speech?: string;
    speechAct?: SpeechAct;
    innerMonologue?: string;
  }>(systemPrompt, userPrompt, { model: player.model, provider: player.provider });

  const rules = getPokerRules();
  if (rules?.sanitizeAction) {
    const sanitized = rules.sanitizeAction(res, toCall, chips, minRaise);
    return {
      type: sanitized.type as ActionType,
      amount: sanitized.amount,
    };
  }

  if (res?.action) {
    let actionType = res.action.toUpperCase() as ActionType;
    if (canCheck && actionType === 'FOLD') actionType = 'CHECK';
    if (!canCheck && actionType === 'CHECK') actionType = 'CALL';

    let amount = res.amount;
    if (actionType === 'CALL') {
      amount = Math.min(chips, toCall);
    } else if (actionType === 'RAISE') {
      const minReq = toCall + minRaise;
      if (!amount || amount < minReq) amount = minReq;
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

  return canCheck ? { type: 'CHECK' } : { type: 'FOLD' };
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
        name: p.name,
        isHuman: p.isHuman ?? (p.persona === 'human' || p.id === 'hero'),
        instruction: p.instruction,
        provider: p.provider,
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
}

export function joinPokerLobby(rawState: PokerGameState, pData: any): { gameState: PokerGameState; player: PlayerState; alreadySeated?: boolean } {
  if (!rawState) throw new Error('joinPokerLobby: Game state not found.');

  const id = String(pData.id || `player_${Date.now()}`);
  const name = String(pData.name || id);
  const isHuman: boolean = Boolean(pData.isHuman ?? (pData.persona === 'human' || id === 'hero'));
  const instruction = pData.instruction ? String(pData.instruction) : undefined;
  const persona = pData.persona ? String(pData.persona) : (isHuman ? 'human' : 'autonomous_agent');
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
}

export function leavePokerLobby(rawState: PokerGameState, id: string): { gameState: PokerGameState; left: boolean; cashedOut?: number } {
  if (!rawState) throw new Error('leavePokerLobby: Game state not found.');

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
}

export function startPokerHand(rawState: PokerGameState): { gameState: PokerGameState } {
  const deck = createDeck();
  const handNumber = (rawState.handNumber || 0) + 1;
  const numPlayers = rawState.players.length;

  const buttonIdx = (rawState.buttonIdx + (handNumber === 1 ? 0 : 1)) % numPlayers;
  const sbIdx = (buttonIdx + 1) % numPlayers;
  const bbIdx = (buttonIdx + 2) % numPlayers;
  const utgIdx = (buttonIdx + 3) % numPlayers;

  const players = rawState.players.map((p, idx) => ({
    ...p,
    streetBet: 0,
    totalHandBet: 0,
    holeCards: [deck.pop()!, deck.pop()!],
    folded: p.chips <= 0,
    allIn: false,
    seatIdx: idx,
  }));

  const sbPlayer = players[sbIdx];
  const sbPost = Math.min(sbPlayer.chips, rawState.sbAmount || 10);
  sbPlayer.chips -= sbPost;
  sbPlayer.streetBet = sbPost;
  sbPlayer.totalHandBet = sbPost;
  if (sbPlayer.chips === 0) sbPlayer.allIn = true;

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
}

export function applyPokerAction(rawState: PokerGameState, action: PlayerAction): { gameState: PokerGameState } {
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

  const recentRemarks = rawState.recentRemarks ? [...rawState.recentRemarks] : [];

  const activeSurvivors = rawState.players.filter((p) => !p.folded);
  const handOver = activeSurvivors.length <= 1;
  const singleSurvivor = activeSurvivors.length === 1;

  const nonFolded = rawState.players.filter((p) => !p.folded);
  const nonAllIn = nonFolded.filter((p) => !p.allIn);
  const allBetsMatched = nonAllIn.every((p) => p.streetBet === currentBet);
  const allActed = nonAllIn.length <= 1 || allBetsMatched;

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

  return { gameState: nextState };
}

export function dealPokerStreet(rawState: PokerGameState): { gameState: PokerGameState } {
  const deck = [...rawState.deck];
  const board = [...rawState.board];

  let nextStreet = rawState.currentStreet;
  let streetName = '';

  if (rawState.currentStreet === 'PREFLOP') {
    nextStreet = 'FLOP';
    deck.pop();
    board.push(deck.pop()!, deck.pop()!, deck.pop()!);
    streetName = 'FLOP';
  } else if (rawState.currentStreet === 'FLOP') {
    nextStreet = 'TURN';
    deck.pop();
    board.push(deck.pop()!);
    streetName = 'TURN';
  } else if (rawState.currentStreet === 'TURN') {
    nextStreet = 'RIVER';
    deck.pop();
    board.push(deck.pop()!);
    streetName = 'RIVER';
  } else if (rawState.currentStreet === 'RIVER') {
    nextStreet = 'SHOWDOWN';
    streetName = 'SHOWDOWN';
  }

  const players = rawState.players.map((p) => ({ ...p, streetBet: 0 }));

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
    currentStreet: 'SHOWDOWN',
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
}

export function rotatePokerDealer(rawState: PokerGameState): { gameState: PokerGameState } {
  const nextBtn = (rawState.buttonIdx + 1) % rawState.players.length;
  return { gameState: { ...rawState, buttonIdx: nextBtn } };
}

export async function processHumanSpeech(
  rawState: PokerGameState,
  args: {
    speechAct?: string;
    text?: string;
    targetId?: string;
    speakerId?: string;
    speakerName?: string;
  }
): Promise<{ gameState: PokerGameState; remark: AmbientRemark; aiResponse?: AmbientRemark | null }> {
  const speechAct = (args.speechAct || 'TABLE_TALK') as SpeechAct;
  const text = String(args.text || '');
  const targetId = args.targetId ? String(args.targetId) : undefined;

  const remarks = [...(rawState.recentRemarks || [])];

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
}

export function checkPokerGameOver(rawState: PokerGameState): {
  gameOver: boolean;
  result: 'GAME_OVER' | 'CONTINUE';
  standings: PlayerStanding[];
  report: string;
  winner: string;
  gameState: PokerGameState;
} {
  if (!rawState) throw new Error('checkPokerGameOver: Game state not found.');

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
}

export function getPokerStandings(rawState: PokerGameState): { standings: PlayerStanding[] } {
  if (!rawState) throw new Error('getPokerStandings: Game state not found.');

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
}

export interface PlayHandHandlers {
  onHumanTurn?: (state: PokerGameState, choices: PlayerChoice[]) => Promise<PlayerAction> | PlayerAction;
  onTableUpdate?: (state: PokerGameState, actionDesc?: string) => Promise<void> | void;
  onStreetDealt?: (state: PokerGameState, street: string) => Promise<void> | void;
  onShowdown?: (state: PokerGameState, winnerSummary: string) => Promise<void> | void;
  onTurnLogged?: (content: string) => Promise<void> | void;
  isAutoplay?: boolean;
}

/**
 * Orchestrates a complete single Texas Hold'em hand across all betting streets
 * (Preflop -> Flop -> Turn -> River -> Showdown & Pot Distribution)
 * without duplicating state machine logic in client runners.
 */
export async function playPokerHand(
  initialState: PokerGameState,
  handlers: PlayHandHandlers = {},
  toolContext?: { prisma?: any; conversationId?: any }
): Promise<{ gameState: PokerGameState; winnerSummary: string }> {
  // 1. Start Hand (rotates button, posts blinds, deals hole cards)
  const startRes = startPokerHand(initialState);
  let state = startRes.gameState;
  await handlers.onTurnLogged?.(`Hand #${state.handNumber} started. Button is Seat ${state.buttonIdx} (${state.players[state.buttonIdx].name}).`);

  // 2. Street Wagering Loop (PREFLOP -> FLOP -> TURN -> RIVER)
  while (!state.handOver && state.currentStreet !== 'SHOWDOWN') {
    let streetDone = false;
    while (!streetDone && !state.handOver) {
      const activeIdx = state.activePlayerIdx;
      const activePlayer = state.players[activeIdx];

      let chosenAction: PlayerAction;
      if (activePlayer.isHuman) {
        const legalChoices = getLegalChoices(state, activeIdx);
        if (handlers.isAutoplay || !handlers.onHumanTurn) {
          const passive = legalChoices.find((c) => c.action.type === 'CHECK' || c.action.type === 'CALL');
          chosenAction = passive ? passive.action : legalChoices[0].action;
        } else {
          chosenAction = await handlers.onHumanTurn(state, legalChoices);
        }
      } else {
        chosenAction = await agenticDecidePokerAction(activePlayer, state);
      }

      const actRes = applyPokerAction(state, chosenAction);
      state = actRes.gameState;
      const actionDesc = `${activePlayer.name}: ${chosenAction.type}${chosenAction.amount ? ' $' + chosenAction.amount : ''}`;
      await handlers.onTableUpdate?.(state, actionDesc);

      if (state.streetComplete || state.handOver) {
        streetDone = true;
      }
    }

    if (!state.handOver) {
      const dealRes = dealPokerStreet(state);
      state = dealRes.gameState;
      await handlers.onStreetDealt?.(state, state.currentStreet);
    }
  }

  // 3. Showdown & Pot Distribution
  const showRes = distributePokerPots(state);
  state = showRes.gameState;
  await handlers.onShowdown?.(state, showRes.winnerSummary);
  await handlers.onTurnLogged?.(`Hand #${state.handNumber} Result: ${showRes.winnerSummary}`);

  return { gameState: state, winnerSummary: showRes.winnerSummary };
}
