export const galleryTypeDefs = /* GraphQL */ `
  scalar JSON

  directive @auth(role: String, roles: [String!]) on FIELD_DEFINITION
  directive @requireRole(role: String!) on FIELD_DEFINITION

  type RoleInfo {
    id: ID!
    name: String!
    description: String
  }

  type UserProjectAccess {
    id: ID!
    name: String!
    roles: [String!]!
  }

  type UserProfile {
    id: ID!
    email: String!
    name: String
    googleId: String
    roles: [RoleInfo!]!
    projects: [UserProjectAccess!]!
    defaultProjectId: String
    createdAt: String
    updatedAt: String
  }

  type GalleryContact {
    phone: String!
    email: String!
  }

  type GalleryInfo {
    projectId: String!
    title: String!
    subtitle: String!
    name: String!
    description: String!
    aboutMarkdown: String!
    orderingMarkdown: String!
    phone: String!
    email: String!
    contact: GalleryContact!
    logoLightUrl: String
    logoDarkUrl: String
    logoPrimaryUrl: String
    logoSecondaryUrl: String
    structuredData: JSON
  }

  type GalleryCategory {
    key: String!
    name: String!
    nameEn: String
    link: String!
    published: Boolean!
    exposed: Boolean!
    sortOrder: Int
    paintingCount: Int!
  }

  type GalleryAuthor {
    key: String!
    name: String!
    link: String!
    bio: String
    paintingCount: Int!
  }

  type GalleryItem {
    id: ID!
    key: String!
    uri: String
    name: String!
    title: String!
    link: String!
    photo: String
    photoUrl: String
    thumbnailUrl: String
    authorKey: String!
    authorName: String!
    author: GalleryAuthor
    categoryKeys: [String!]!
    categories: [GalleryCategory!]!
    published: Boolean!
    description: String
    width: Int
    height: Int
    size: Int
    createdAt: String
    updatedAt: String
  }

  type GalleryStats {
    projectId: String!
    totalItems: Int!
    publishedItems: Int!
    draftItems: Int!
    unpublishedItems: Int!
    totalCategories: Int!
    publishedCategories: Int!
    categoriesCount: Int!
    totalAuthors: Int!
    authorsCount: Int!
    totalAttachments: Int!
    attachmentsCount: Int!
  }

  type TableHealth {
    name: String!
    rowCount: Int!
  }

  type CuratorDatabaseHealth {
    storageEngine: String!
    isOpfs: Boolean!
    tables: [TableHealth!]!
    requestsTotal: Int!
    requestsCompleted: Int!
    requestsFailed: Int!
    requestsPending: Int!
    agentsTotal: Int!
    agentsActive: Int!
  }

  type CuratorMetrics {
    totalRequests: Int!
    completedRequests: Int!
    failedRequests: Int!
    totalAgents: Int!
    activeAgents: Int!
    totalTools: Int!
    databaseEngine: String!
  }

  type ToolInfo {
    name: String!
    description: String
    accessLevel: String
    parameters: JSON
  }

  type AgentInfo {
    id: ID
    name: String!
    description: String
    schedule: String
    enabled: Boolean!
    isActive: Boolean
    ast: String
    episodesCount: Int
    tracksCount: Int
    lastRunAt: String
  }

  type CuratorResponseItem {
    id: ID
    requestId: ID
    content: String
    createdAt: String
  }

  type CuratorRequestItem {
    id: ID!
    scriptId: ID
    parentId: ID
    notifyId: ID
    agentName: String
    toolName: String
    status: String!
    retryCount: Int
    ast: String
    context: String
    scheduledAt: String
    createdAt: String
    updatedAt: String
    responses: [CuratorResponseItem!]!
  }

  type TriggerAgentPayload {
    id: ID
    requestId: String
    agent: String
    content: String
    status: String
    createdAt: String
    success: Boolean!
    error: String
  }

  type ExecuteToolPayload {
    success: Boolean!
    tool: String!
    result: JSON
    error: String
  }

  type CompileCoffeePayload {
    success: Boolean!
    ast: JSON
    error: String
  }

  type Query {
    me: UserProfile
    galleryInfo(projectId: String): GalleryInfo!
    galleryCategories(projectId: String, includeUnpublished: Boolean): [GalleryCategory!]!
    galleryAuthors(projectId: String): [GalleryAuthor!]!
    galleryItems(
      projectId: String
      search: String
      categoryKey: String
      categoryLink: String
      authorKey: String
      publishedOnly: Boolean
      limit: Int
      offset: Int
    ): [GalleryItem!]!
    galleryItemsCount(
      projectId: String
      search: String
      categoryKey: String
      categoryLink: String
      authorKey: String
      publishedOnly: Boolean
    ): Int!
    galleryItem(projectId: String, key: String, link: String): GalleryItem
    galleryStats(projectId: String): GalleryStats!

    metrics: CuratorMetrics!
    curatorDatabaseHealth: CuratorDatabaseHealth!
    tools: [ToolInfo!]!
    agents: [AgentInfo!]!
    curatorAgents: [AgentInfo!]!
    curatorRequests(limit: Int): [CuratorRequestItem!]!
    curatorRequest(id: ID!): CuratorRequestItem
  }

  type Mutation {
    executeTool(name: String!, args: JSON): ExecuteToolPayload!
    triggerAgent(name: String, id: ID, agentName: String, context: JSON, refresh: Boolean): TriggerAgentPayload!
    triggerCuratorAgent(name: String, agentName: String, refresh: Boolean): TriggerAgentPayload!
    toggleAgent(id: ID!, enabled: Boolean, isActive: Boolean): AgentInfo
    toggleCuratorAgent(id: ID!, enabled: Boolean, isActive: Boolean): AgentInfo
    updateAgentSchedule(id: ID!, schedule: String!): AgentInfo
    deleteAgent(id: ID!): Boolean!
    compileCoffeeScript(code: String!): CompileCoffeePayload!
    broadcastEvent(type: String!, payload: JSON): Boolean!
    toggleEnginePause: Boolean!
  }
`;
