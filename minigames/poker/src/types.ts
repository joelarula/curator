import {
  PokerStreet,
  PokerActionType,
  type PokerStreetType,
  type PokerActionTypeValue,
} from './models/pokerContracts.ts';

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export { PokerStreet, PokerActionType };
export type Street = PokerStreetType;
export type ActionType = PokerActionTypeValue;

export type SpeechAct = string;

export interface PlayerAction {
  type: ActionType;
  amount?: number; // total wagered this street, or raise amount
}

export type PersonaType =
  | 'shark'
  | 'rock'
  | 'fish'
  | 'maniac'
  | 'caller'
  | 'bluffer'
  | (string & {});

export interface PlayerState {
  id: string;
  name: string;
  isHuman?: boolean;
  isInteractive?: boolean;
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

export const PokerStandingStatus = {
  WINNER: 'Winner',
  ACTIVE: 'Active',
  BUST: 'Bust',
  CASHED_OUT: 'Cashed Out',
} as const;

export type PokerStandingStatusType =
  (typeof PokerStandingStatus)[keyof typeof PokerStandingStatus];

export interface PlayerStanding {
  rank: number;
  id: string;
  name: string;
  startChips: number;
  finalChips: number;
  net: number;
  status: PokerStandingStatusType;
}

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface AmbientRemark {
  speakerId: string;
  speakerName: string;
  speechAct?: SpeechAct;
  recipientId?: string; // for whispers
  targetId?: string;
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
  wallet?: number;
  buyIn?: number;
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
