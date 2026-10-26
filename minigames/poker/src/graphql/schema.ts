import { buildSchema, type GraphQLSchema } from 'graphql';

export const POKER_SCHEMA_SDL = /* GraphQL */ `
  type PokerPlayer {
    id: String!
    name: String!
    chips: Int!
    isHuman: Boolean
    isFolded: Boolean
    isAllIn: Boolean
    streetBet: Int!
    cards: [String!]
  }

  type PokerGameState {
    currentStreet: String!
    pot: Int!
    currentBet: Int!
    activePlayerIdx: Int!
    dealerIdx: Int!
    sbIdx: Int
    bbIdx: Int
    players: [PokerPlayer!]!
    communityCards: [String!]!
    minRaise: Int
    gameOver: Boolean
  }

  type ChoiceOption {
    action: String!
    amount: Int
    min: Int
    max: Int
  }

  type HumanTurnPromptInfo {
    requestId: Int!
    player: String!
    name: String!
    chips: Int!
    pot: Int!
    toCall: Int!
    street: String!
    choices: [ChoiceOption!]
  }

  type PokerTableInfo {
    tableId: ID!
    conversationId: Int!
    title: String!
    createdAt: String
    gameState: PokerGameState
    waitingForHuman: Boolean!
    humanTurn: HumanTurnPromptInfo
  }


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
