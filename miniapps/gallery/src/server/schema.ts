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
    slug: String!
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
    projectSlug: String!
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
    seo: GallerySeoMeta
  }

  type GallerySeoImage {
    loc: String!
    thumbnailLoc: String
    title: String!
    caption: String
    width: Int
    height: Int
  }

  type GallerySeoMeta {
    title: String!
    description: String!
    keywords: [String!]!
    canonicalPath: String!
    canonicalUrl: String!
    robots: String!
    ogType: String!
    ogTitle: String!
    ogDescription: String!
    ogImage: String
    ogImageWidth: Int
    ogImageHeight: Int
    ogImageAlt: String!
    locale: String!
    lastModified: String!
    jsonLd: JSON
  }

  type GallerySeoRoute {
    path: String!
    canonicalUrl: String!
    type: String!
    slug: String!
    title: String!
    description: String!
    keywords: [String!]!
    lastModified: String!
    changeFreq: String!
    priority: Float!
    image: GallerySeoImage
  }

  type GallerySeoItemEntry {
    key: String!
    slug: String!
    photoSlug: String!
    title: String!
    path: String!
    canonicalUrl: String!
    authorKey: String!
    authorSlug: String!
    authorName: String!
    categoryKeys: [String!]!
    categorySlugs: [String!]!
    categoryNames: [String!]!
    photoUrl: String
    thumbnailUrl: String
    width: Int
    height: Int
    updatedAt: String!
  }

  type GallerySeoIndex {
    projectId: String!
    projectSlug: String!
    canonicalBaseUrl: String!
    generatedAt: String!
    lastModified: String!
    etag: String!
    totalRoutes: Int!
    totalPhotos: Int!
    totalCategories: Int!
    totalAuthors: Int!
    site: GalleryInfo!
    routes: [GallerySeoRoute!]!
    categories: [GalleryCategory!]!
    authors: [GalleryAuthor!]!
    items: [GallerySeoItemEntry!]!
    sitemapXmlUrl: String!
    llmsTxtUrl: String!
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
    seo: GallerySeoMeta
  }

  type GalleryAuthor {
    key: String!
    name: String!
    link: String!
    bio: String
    paintingCount: Int!
    seo: GallerySeoMeta
  }

  type GalleryItem {
    id: ID!
    key: String!
    uri: String
    name: String!
    title: String!
    link: String!
    slug: String!
    projectSlug: String!
    photo: String
    photoSlug: String
    photoUrl: String
    thumbnailSlug: String
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
    seo: GallerySeoMeta
  }

  type GalleryPage {
    items: [GalleryItem!]!
    total: Int!
    page: Int!
    pageSize: Int!
    totalPages: Int!
    offset: Int!
    limit: Int!
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    activeCategory: GalleryCategory
    activeAuthor: GalleryAuthor
    categories: [GalleryCategory!]!
    authors: [GalleryAuthor!]!
    seo: GallerySeoMeta
  }

  type GalleryPhotoStep {
    item: GalleryItem!
    position: Int!
    totalInSequence: Int!
    hasPrevious: Boolean!
    hasNext: Boolean!
    previousItem: GalleryItem
    nextItem: GalleryItem
    firstItem: GalleryItem
    lastItem: GalleryItem
    surroundingItems: [GalleryItem!]!
    activeCategory: GalleryCategory
    activeAuthor: GalleryAuthor
    seo: GallerySeoMeta
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
    ui: JSON
  }

  type AgentInfo {
    id: ID
    name: String!
    description: String
    schedule: String
    enabled: Boolean!
    isActive: Boolean
    ast: String
    title: String
    icon: String
    starterPrompts: [String!]
    capabilities: JSON
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
    requestId: ID
    status: String
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

    """
    Public-facing paginated gallery search & browse API.
    Always returns only published photos (isPublished: true) with pagination metadata.
    """
    publicGalleryPage(
      projectId: String
      search: String
      category: String
      categoryKey: String
      categoryLink: String
      author: String
      authorKey: String
      authorLink: String
      page: Int
      pageSize: Int
      limit: Int
      offset: Int
    ): GalleryPage!

    """
    Public-facing photo detail & stepping API.
    Returns the requested public photo along with previousItem, nextItem,
    firstItem, lastItem, position, totalInSequence, and surroundingItems
    within the active category/author/search sequence.
    """
    publicGalleryPhoto(
      projectId: String
      slug: String
      link: String
      key: String
      search: String
      category: String
      categoryKey: String
      categoryLink: String
      author: String
      authorKey: String
      authorLink: String
      wrapAround: Boolean
      windowSize: Int
    ): GalleryPhotoStep

    """
    Public-facing SEO Site Index query.
    Returns complete route manifest, XML sitemap link, Schema.org entities,
    and compact index of all published artworks for static site generation (SSG)
    or client-side search hydration in external frontend applications.
    """
    publicGallerySeoIndex(projectId: String, baseUrl: String): GallerySeoIndex!

    galleryItems(
      projectId: String
      search: String
      category: String
      categoryKey: String
      categoryLink: String
      author: String
      authorKey: String
      authorLink: String
      publishedOnly: Boolean
      page: Int
      pageSize: Int
      limit: Int
      offset: Int
    ): [GalleryItem!]!
    galleryItemsCount(
      projectId: String
      search: String
      category: String
      categoryKey: String
      categoryLink: String
      author: String
      authorKey: String
      authorLink: String
      publishedOnly: Boolean
    ): Int!
    galleryItem(projectId: String, key: String, link: String, slug: String): GalleryItem
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
