import type { SemanticNodeShape } from '../curator.ts';
import type { PokerEvent } from './pokerContracts.ts';
import type { PokerLobbyTable } from './pokerLobbyMenu.ts';

export const POKER_SHAPE_URIS = {
  TABLE_SHAPE: 'poker:PokerTableShape',
  TABLE_CLASS: 'poker:Table',
  PLAYER_PREDICATE: 'poker:hasPlayer',
  STATUS_PREDICATE: 'poker:status',
  CONVERSATION_PREDICATE: 'poker:hasConversation',
  MAX_SEATS_PREDICATE: 'poker:maxSeats',
  BLINDS_PREDICATE: 'poker:blinds',
  BANKROLL_SHAPE: 'poker:PokerBankrollShape',
  BANKROLL_CLASS: 'poker:Bankroll',
  BALANCE_PREDICATE: 'poker:balance',
} as const;

export const POKER_TABLE_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  /** The game reached game over. */
  FINISHED: 'finished',
  /** The table workflow crashed; details are in the conversation state's `lastFailure`. */
  FAILED: 'failed',
  /** A player or the host closed the table. */
  CLOSED: 'closed',
} as const;

export type PokerTableStatusType = (typeof POKER_TABLE_STATUS)[keyof typeof POKER_TABLE_STATUS];

/** Table lifecycle statuses that can be resumed from the lobby. */
export const RESUMABLE_TABLE_STATUSES: readonly PokerTableStatusType[] = [
  POKER_TABLE_STATUS.ACTIVE,
  POKER_TABLE_STATUS.PAUSED,
] as const;

export const TABLE_URI_PREFIX = 'poker:table:';
export const PLAYER_URI_PREFIX = 'poker:player:';
export const AGENT_URI_PREFIX = 'poker:agent:';

export interface PokerSeat {
  id: string;
  name?: string;
  isHuman?: boolean;
}

export const pokerTableUri = (tableId: string | number): string => `${TABLE_URI_PREFIX}${tableId}`;
export const pokerTableStatusUri = (status: PokerTableStatusType): string =>
  `${POKER_SHAPE_URIS.STATUS_PREDICATE}:${status}`;
export const pokerPlayerUri = (id: string, isHuman: boolean = true): string =>
  `${isHuman ? PLAYER_URI_PREFIX : AGENT_URI_PREFIX}${id}`;
export const pokerSeatUri = (seat: PokerSeat): string => pokerPlayerUri(seat.id, Boolean(seat.isHuman));
export const pokerBankrollUri = (userId: string): string => `${POKER_SHAPE_URIS.BANKROLL_CLASS}:${userId}`;

export interface PokerTableResourceMetadata {
  shape: typeof POKER_SHAPE_URIS.TABLE_SHAPE;
  maxSeats: number;
}

export interface SyncPokerTableParams {
  tableId: string | number;
  title: string;
  conversationId: number;
  projectId: string;
  userId: string;
  status?: PokerTableStatusType;
  maxSeats?: number;
  players?: PokerSeat[];
}

export interface QueryPokerTablesParams {
  projectId: string;
  userId?: string;
  playerName?: string;
}

export interface ActivePokerTablesResult {
  tables: PokerLobbyTable[];
}

export type BankrollCurrency = 'CHIPS' | (string & {});

export interface PokerBankrollMetadata {
  balance: number;
  initialBalance?: number;
  currency: BankrollCurrency;
  lastDeposit?: number;
  lastCashOut?: number;
  lastReload?: number;
  updatedAt: string;
}

export interface BankrollInfo {
  uri: string;
  userId: string;
  balance: number;
  currency: BankrollCurrency;
  updatedAt: string;
}

export interface BankrollSummary {
  balance: number;
  currency: BankrollCurrency;
  formattedBalance: string;
}

export type BuyInPresetId = 'short' | 'standard' | 'deep' | 'all_in_wallet' | (string & {});

export interface BuyInChoicePayload {
  id: BuyInPresetId;
  amount: number;
}

export interface BuyInPreset {
  id: BuyInPresetId;
  label: string;
  description: string;
  amount: number;
  aliases: string[];
  event: typeof PokerEvent.BUY_IN_CHOICE;
  payload: BuyInChoicePayload;
  value: BuyInChoicePayload;
}

export interface BuyInLimits {
  minBuyIn: number;
  maxBuyIn: number;
}

export interface BuyInOptionsResult extends BuyInLimits {
  balance: number;
  canAfford: boolean;
  choices: BuyInPreset[];
}

export interface ChipAmountObject {
  id?: string | number;
  label?: string;
  amount?: number | string;
  value?: number | string | ChipAmountObject;
  payload?: number | string | ChipAmountObject;
  choice?: number | string | ChipAmountObject;
}

export type ChipAmountInput = number | string | ChipAmountObject | null | undefined;

export interface DepositBuyInResult {
  success: boolean;
  newBalance: number;
  deposited: number;
  reason?: 'insufficient_funds';
}

export interface CashOutResult {
  success: boolean;
  newBalance: number;
  cashedOut: number;
}

export interface ReloadBankrollResult extends BankrollInfo {
  added: number;
}

export interface ReloadBankrollToolResult {
  success: boolean;
  added: number;
  balance: number;
}

export interface PokerResourceRecord {
  id: number;
  uri: string;
  title?: string | null;
  description?: string | null;
  userId: string;
  projectId?: string | null;
  metadata?: Record<string, unknown> | string | null;
  existent?: boolean;
  deletedAt?: Date | string | null;
  conversations?: Array<{ id: number }>;
}

export interface PokerBankrollDb {
  resource: {
    findUnique(args: { where: { uri?: string; id?: number }; [key: string]: unknown }): Promise<PokerResourceRecord | null>;
    create(args: { data: Record<string, unknown> }): Promise<PokerResourceRecord>;
    update(args: { where: { uri?: string; id?: number }; data: Record<string, unknown> }): Promise<PokerResourceRecord>;
  };
}

export interface PokerStoreDb extends PokerBankrollDb {
  resource: PokerBankrollDb['resource'] & {
    findFirst(args: { where: Record<string, unknown>; [key: string]: unknown }): Promise<PokerResourceRecord | null>;
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }): Promise<PokerResourceRecord[]>;
    upsert(args: {
      where: { uri: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }): Promise<PokerResourceRecord>;
  };
  relation: {
    upsert(args: {
      where: { subjectId_predicateId_objectId: { subjectId: number; predicateId: number; objectId: number } };
      update: { existent: boolean };
      create: {
        subjectId: number;
        predicateId: number;
        objectId: number;
        projectId?: string | null;
        existent: boolean;
      };
    }): Promise<unknown>;
    updateMany(args: { where: Record<string, unknown>; data: { existent: boolean } }): Promise<{ count: number }>;
  };
  $transaction<T>(fn: (db: PokerStoreDb) => Promise<T>): Promise<T>;
}

/**
 * Semantic Node Shape for a Texas Hold'em game table resource in Curator's Knowledge Graph.
 * Unifies game metadata and links players (both human Users and autonomous AI Agents)
 * without polluting the core Prisma schema with domain-specific tables.
 */
export const PokerTableShape: SemanticNodeShape = {
  uri: POKER_SHAPE_URIS.TABLE_SHAPE,
  targetClass: POKER_SHAPE_URIS.TABLE_CLASS,
  name: 'Poker Table',
  description: "Texas Hold'em game table session resource with seated players and active conversation link",
  properties: {
    tableName: {
      path: 'schema:name',
      name: 'Table Name',
      description: 'Display title of the poker table',
      datatype: 'xsd:string',
      minCount: 1,
      maxCount: 1,
    },
    status: {
      path: POKER_SHAPE_URIS.STATUS_PREDICATE,
      name: 'Table Status',
      description: 'Current lifecycle state of the table: active, paused, finished, failed, closed',
      datatype: 'xsd:string',
      in: Object.values(POKER_TABLE_STATUS),
      minCount: 1,
      maxCount: 1,
    },
    maxSeats: {
      path: POKER_SHAPE_URIS.MAX_SEATS_PREDICATE,
      name: 'Max Seats',
      description: 'Maximum number of seats available at table',
      datatype: 'xsd:integer',
      maxCount: 1,
    },
    conversationId: {
      path: POKER_SHAPE_URIS.CONVERSATION_PREDICATE,
      name: 'Table Conversation ID',
      description: 'Curator Conversation ID executing the table AST workflow',
      datatype: 'xsd:string',
      maxCount: 1,
    },
    players: {
      path: POKER_SHAPE_URIS.PLAYER_PREDICATE,
      name: 'Seated Players',
      description: 'Users and Agents currently seated at this table',
      class: ['schema:Person', 'curator:Agent'],
    },
  },
};

/**
 * Semantic Node Shape for a Player Bankroll resource in Curator's Knowledge Graph.
 */
export const PokerBankrollShape: SemanticNodeShape = {
  uri: POKER_SHAPE_URIS.BANKROLL_SHAPE,
  targetClass: POKER_SHAPE_URIS.BANKROLL_CLASS,
  name: 'Poker Bankroll',
  description: "Persistent chip bankroll and cashier balance for a player across tables",
  properties: {
    balance: {
      path: POKER_SHAPE_URIS.BALANCE_PREDICATE,
      name: 'Chip Balance',
      description: 'Available bankroll chips for table buy-ins',
      datatype: 'xsd:integer',
      minCount: 1,
      maxCount: 1,
    },
  },
};

