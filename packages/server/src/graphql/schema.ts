export const curatorGraphQLTypeDefs = /* GraphQL */ `
  scalar JSON

  type ToolParameter {
    type: String
    description: String
  }

  type ToolDefinition {
    name: String!
    description: String
    accessLevel: String
    parameters: JSON
    "Presentation hints: progressLabel, messageAction"
    ui: JSON
  }

  type AgentDefinition {
    name: String!
    description: String
    schedule: String
    enabled: Boolean!
    "Display name (presentation.title, else the name)"
    title: String
    icon: String
    starterPrompts: [String!]
    "Entry model capabilities: tools (native|prompt|none), vision, json, streaming, embeddings, provider, model, dynamic"
    capabilities: JSON
  }

  type CuratorResponseSummary {
    id: ID!
    requestId: String
    content: String!
    createdAt: String!
  }

  type CuratorRequestSummary {
    id: ID!
    scriptId: String
    parentId: String
    notifyId: String
    toolName: String
    agentName: String
    status: String!
    retryCount: Int
    ast: JSON
    context: JSON
    scheduledAt: String
    createdAt: String!
    updatedAt: String
    responses: [CuratorResponseSummary!]!
  }

  type CuratorAgentSummary {
    id: ID!
    name: String!
    schedule: String
    isActive: Boolean!
    enabled: Boolean!
    lastRunAt: String
  }

  type CuratorTableInfo {
    name: String!
    rowCount: Int!
  }

  type CuratorDatabaseHealth {
    storageEngine: String!
    isOpfs: Boolean!
    tables: [CuratorTableInfo!]!
    requestsTotal: Int!
    requestsCompleted: Int!
    requestsFailed: Int!
    requestsPending: Int!
    agentsTotal: Int!
    agentsActive: Int!
  }

  type MeshEvent {
    type: String!
    payload: JSON
    timestamp: String!
    sender: String
  }

  type PeerInfo {
    id: String!
    name: String!
    status: String!
    eventsUrl: String
  }

  type Conversation {
    id: ID!
    externalId: String
    userId: String
    metadata: JSON
    createdAt: String!
    updatedAt: String
    responses: [CuratorResponseSummary!]!
  }

  type MetricStats {
    totalRequests: Int!
    completedRequests: Int!
    failedRequests: Int!
    totalAgents: Int!
    activeAgents: Int!
    totalTools: Int!
    databaseEngine: String!
  }

  type ToolExecutionResult {
    success: Boolean!
    tool: String!
    result: JSON
    "Request the call ran as; follow its curator:progress events"
    requestId: ID
    "Request status, e.g. COMPLETED or WAITING_FOR_USER (approval pending)"
    status: String
    error: String
  }

  type AgentTriggerResult {
    success: Boolean!
    requestId: ID!
    agent: String!
    status: String!
    error: String
  }

  type CompileResult {
    success: Boolean!
    ast: JSON
    error: String
  }

  type MessageResult {
    success: Boolean!
    conversationId: ID!
    responseId: ID
    reply: String
    error: String
  }

  type Query {
    # System & Metrics
    metrics: MetricStats!
    curatorDatabaseHealth: CuratorDatabaseHealth!
    "Which of the given host actions (db.status, db.export, db.import; all when omitted) the caller may perform."
    allowedActions(names: [String!]): [String!]!

    # Tools
    tools: [ToolDefinition!]!
    tool(name: String!): ToolDefinition

    # Agents
    "Agents the caller may address (always filtered here; usable is accepted for clients that ask explicitly)."
    agents(usable: Boolean): [AgentDefinition!]!
    agent(name: String!): AgentDefinition
    curatorAgents: [CuratorAgentSummary!]!

    # Execution Requests & Tasks
    curatorRequests(limit: Int, status: String): [CuratorRequestSummary!]!
    curatorRequest(id: ID!): CuratorRequestSummary

    # Conversations & Chat
    conversations(limit: Int): [Conversation!]!
    conversation(id: ID!): Conversation

    # Events & Federation
    events(limit: Int): [MeshEvent!]!
    peers: [PeerInfo!]!
  }

  type Mutation {
    # Tool & Agent Execution
    executeTool(name: String!, args: JSON): ToolExecutionResult!
    triggerAgent(name: String!, context: JSON): AgentTriggerResult!
    
    # Dialog Loop Message
    sendMessage(conversationId: ID, content: String!): MessageResult!

    # CoffeeScript AST Compilation
    compileCoffeeScript(code: String!): CompileResult!

    # Mesh & Events
    broadcastEvent(type: String!, payload: JSON): Boolean!

    # Agent Management
    toggleCuratorAgent(id: ID!, isActive: Boolean!): CuratorAgentSummary!
    updateAgentSchedule(id: ID!, schedule: String!): CuratorAgentSummary!

    # Engine Control
    toggleEnginePause: Boolean!
  }
`;
