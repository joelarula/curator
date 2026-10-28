import type { SemanticNodeShape } from '../curator.ts';

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

