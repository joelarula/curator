import type { AmbientSpeechActType } from './curator.ts';

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type Street = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN';

export type ActionType = 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN' | 'PAUSE' | 'RESUME' | 'EXIT';

/**
 * Unified with Curator's canonical Tabletop & Interaction Matrix speech acts
 * (TABLE_TALK, BANTER, WHISPER, PROVOKE, GOSSIP, etc.)
 */
export type SpeechAct = AmbientSpeechActType | string;

export interface PlayerAction {
  type: ActionType;
  amount?: number; // total wagered this street, or raise amount
}

export interface SpeechAction {
  text: string;
  speechAct?: SpeechAct;
  targetId?: string;
  speakerId?: string;
  speakerName?: string;
}

export interface AgenticSpeechResult {
  speakerId: string;
  speakerName: string;
  speechAct: SpeechAct;
  recipientId?: string;
  text: string;
  innerMonologue: string;
}

export type PersonaType = string;

export interface PlayerState {
  id: string;
  name: string;
  isHuman: boolean;
  instruction?: string; // Autonomous agent system prompt / persona instruction
  provider?: string;    // LLM provider identifier (e.g. 'gemini', 'openai', 'mock')
  model?: string;       // LLM model identifier for Curator LLM dispatch
  persona?: PersonaType;
  chips: number;
  wallet?: number;      // Player's personal bankroll / wallet balance
  buyIn?: number;       // Amount of chips committed to the table from wallet
  streetBet: number;
  totalHandBet: number;
  holeCards: Card[];
  folded: boolean;
  allIn: boolean;
  seatIdx: number;
  lastMonologue?: string;
}

export interface PlayerStanding {
  rank: number;
  id: string;
  name: string;
  startChips: number;
  finalChips: number;
  net: number;
  status: 'Winner' | 'Active' | 'Bust' | 'Cashed Out';
}

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface AmbientRemark {
  speakerId: string;
  speakerName: string;
  speechAct: SpeechAct;
  recipientId?: string; // for whispers
  text: string;
  timestamp: number;
}

export interface PlayerJoinOptions {
  id: string;
  name: string;
  isHuman?: boolean;
  instruction?: string;
  provider?: string;
  persona?: PersonaType;
  model?: string;
  chips?: number;
  seatIdx?: number;
}

export interface PokerGameState {
  tableId: string;
  handNumber: number;
  buttonIdx: number;
  sbIdx: number;
  bbIdx: number;
  sbAmount: number;
  bbAmount: number;
  smallBlind?: number;
  bigBlind?: number;
  currentStreet: Street;
  board: Card[];
  deck: Card[];
  pot: number;
  sidePots: SidePot[];
  currentBet: number;
  minRaise: number;
  activePlayerIdx: number;
  streetComplete: boolean;
  handOver: boolean;
  gameOver?: boolean;
  singleSurvivor: boolean;
  winnerIds: string[];
  players: PlayerState[];
  recentRemarks?: AmbientRemark[];
  lastActionSummary?: string;
  maxSeats?: number;
  startingChips?: number;
  startingWallets?: Record<string, number>;
  revealHandsOnSettle?: boolean;
  maxHands?: number;
  finalStandings?: PlayerStanding[];
}

