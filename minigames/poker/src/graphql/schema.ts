import { buildSchema, type GraphQLSchema } from 'graphql';

export const POKER_SCHEMA_SDL = /* GraphQL */ `


  input ActionInput {
    action: String!
    amount: Int
  }

  type ActionResult {
    success: Boolean!
    tableId: String!
    woken: Boolean!
    action: String!
    sessionId: String
  }

  type SpeechResult {
    success: Boolean!
    tableId: String!
    text: String!
    aiReply: String
    sessionId: String
  }

  type TableEvent {
    type: String!
    payload: String
    sessionId: String
    tableId: String
    conversationId: Int
    timestamp: Float!
  }

  input CreateTableInput {
    title: String
    maxSeats: Int
    startingChips: Int
    smallBlind: Int
    bigBlind: Int
  }

  type Query {
    tables: [PokerTableInfo!]!
    table(id: ID!): PokerTableInfo
    waitingTurn(tableId: ID): HumanTurnPromptInfo
    gameState(tableId: ID): PokerGameState
  }

  type Mutation {
    createTable(input: CreateTableInput): PokerTableInfo!
    submitAction(tableId: ID, action: ActionInput!, sessionId: String): ActionResult!
    submitSpeech(tableId: ID, text: String!, speechAct: String, targetId: String, sessionId: String): SpeechResult!
  }

  type Subscription {
    tableEvents(tableId: ID, sessionId: String): TableEvent!
  }
`;

export const pokerGraphQLSchema: GraphQLSchema = buildSchema(POKER_SCHEMA_SDL);
