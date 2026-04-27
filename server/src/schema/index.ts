import { gql } from 'graphql-tag';

/**
 * schema/index.ts
 *
 * GraphQL SDL type definitions for the Padagaskar knowledge platform.
 *
 * Architecture overview:
 *   Source   — Stable identity node. Every piece of knowledge is anchored to a
 *              Source, which holds a unique URL or wiki path.  Sources form a
 *              tree via parentId / materializedPath and a semantic graph via
 *              Relation edges.
 *   Text     — Content layer. A Source can have many Text records (versions,
 *              translations). The newest one is used for reading / editing.
 *   Relation — Directed, role-typed edge between two Sources.
 *   Feed     — RSS/Atom subscription.  Polling creates new Sources; an optional
 *              aiPrompt triggers the FeedAgentService tool-calling pipeline.
 *   Report   — AI analysis result attached to a Source + Text pair.
 *   Tag      — Key-value label attached to Sources or Texts.
 *
 * All queries and mutations require a valid Bearer JWT (Google OAuth).
 */
export const typeDefs = gql`

  """
  An authenticated user of the platform.
  Authentication is handled via Google OAuth; the JWT is passed as a Bearer token.
  """
  type User {
    "Unique identifier (CUID)"
    id: ID!
    "Google account email address"
    email: String!
    "Display name from Google profile"
    name: String
    "Google OAuth subject ID — used to match returning users on subsequent logins"
    googleId: String
    createdAt: String!
    updatedAt: String!
  }

  """
  The core identity node of the knowledge graph.

  A Source is a stable, addressable piece of knowledge — a wiki page (WIKI_PAGE),
  a web article (WEB), a book, an RSS item, etc.

  Dual structure:
    1. Tree  — via parentId / materializedPath (e.g. 'science/ai/agents').
               materializedPath is the full slash-separated route used as the wiki URL.
    2. Graph — via Relation edges connecting arbitrary Sources.

  Soft-delete: set existent = null to hide a Source without destroying its data.
  """
  type Source {
    "Unique identifier (CUID)"
    id: ID!
    "External origin URL (null for pure wiki pages)"
    url: String
    "Local slug segment within its parent (e.g. 'agents')"
    path: String
    "Full slash-separated path from root (e.g. 'science/ai/agents'). Used as the wiki URL."
    materializedPath: String
    "Nesting depth in the tree (0 = root)"
    depth: Int
    "Human-readable display title"
    title: String
    "Short summary or subtitle"
    description: String
    "Source type: WEB | WIKI_PAGE | BOOK | etc."
    type: String!
    "Lifecycle status: NEW | REVIEWED | PROCESSED | DISCARDED | IMPORTANT | ARCHIVE | AI_FAILED"
    status: String
    "Whether this source is publicly visible"
    isPublished: Boolean
    "Formal publication date (ISO string)"
    publishedAt: String

    "Direct parent in the wiki hierarchy tree"
    parent: Source
    "Parent node ID (denormalised for query performance)"
    parentId: ID
    "Direct children in the wiki hierarchy tree"
    children: [Source!]!

    "Versioned Text content records, ordered newest-first. Paginated."
    texts(skip: Int, take: Int): [Text!]!
    "Semantic Relation edges where this Source is the origin"
    outboundRelations: [Relation!]!
    "Semantic Relation edges where this Source is the target"
    inboundRelations: [Relation!]!

    "Classification tags attached to this Source"
    tags: [Tag!]!
    "File attachments linked to this Source"
    attachments: [Attachment!]!
    "Raw JSON metadata blob (OG tags, favicon URL, etc.) serialised as a string"
    metadata: String

    "All ancestor Sources from root down to this node's parent, derived from materializedPath"
    ancestors: [Source!]!
    "All descendant Sources below this node, derived from materializedPath prefix"
    descendants: [Source!]!
    "Aggregate counts — used by the sidebar tree to decide whether to show an expand arrow"
    _count: SourceCount

    createdAt: String!
    updatedAt: String!
  }

  "Aggregate child-count helper returned alongside Source nodes."
  type SourceCount {
    "Number of direct child Sources in the tree"
    children: Int
    "Number of Text records attached to this Source"
    texts: Int
  }

  "Paginated list of Source nodes."
  type SourceConnection {
    items: [Source!]!
    totalCount: Int!
  }

  """
  A versioned content record attached to a Source.

  Every wiki page has at least one Text. The most recently created Text is
  treated as the current content for reading and editing. Multiple Texts on
  the same Source can represent different languages, drafts, or versions.
  """
  type Text {
    "Unique identifier (CUID)"
    id: ID!
    "Full markdown content of this text block"
    content: String!
    "BCP-47 language code (e.g. 'et', 'en')"
    language: String
    "Whether this text is publicly visible"
    isPublished: Boolean

    "The Source identity this Text belongs to"
    originSource: Source!
    "The user who authored this Text"
    user: User!

    "AI analysis Reports that reference this Text"
    reports: [Report!]!
    "Classification tags attached to this Text"
    tags: [Tag!]!
    "Quantitative analysis metrics derived from this Text"
    metrics: [AnalysisMetric!]!

    createdAt: String!
    updatedAt: String!
  }

  "Paginated list of Text records."
  type TextConnection {
    items: [Text!]!
    totalCount: Int!
  }

  """
  A directed, role-typed semantic edge between two Source nodes.

  Roles: LINK (wiki [[link]]), CITATION, SUMMARY, ORIGIN, REFERENCE.
  Allows building a knowledge graph layer on top of the tree hierarchy.
  """
  type Relation {
    "Unique identifier (CUID)"
    id: ID!
    "Semantic role of this edge: LINK | CITATION | SUMMARY | ORIGIN | REFERENCE"
    role: String!
    "The Source where this relation originates"
    fromSource: Source!
    "The Source this relation points to"
    toSource: Source!
    "Optional JSON metadata blob (e.g. anchor text, selection offset) serialised as a string"
    metadata: String
    createdAt: String!
  }

  """
  An AI analysis result linked to a Source and one or more Texts.

  Reports track the lifecycle of AI processing:
    PENDING → PROCESSING → COMPLETED | FAILED
  """
  type Report {
    "Unique identifier (CUID)"
    id: ID!
    "Processing status: PENDING | PROCESSING | COMPLETED | FAILED"
    status: String!

    "The Source this report analyses"
    source: Source!
    "The Text records included in this analysis run"
    texts: [Text!]!

    "The AI model used to generate this report"
    aiModel: AIModel!
    "The specific versioned prompt used — links back to a PromptTemplate"
    promptVersion: PromptVersion

    "Raw JSON output from the AI, serialised as a string scalar"
    resultJson: String
    "Quantitative metrics extracted during analysis"
    metrics: [AnalysisMetric!]!

    "True if generated by AI (vs. human-authored)"
    isAiGenerated: Boolean!
    "Human-readable label describing the AI methodology used"
    transparencyLabel: String
    "Whether this report is publicly visible"
    isPublished: Boolean!

    createdAt: String!
    updatedAt: String!
  }

  "A named numeric metric extracted from a text analysis run."
  type AnalysisMetric {
    id: ID!
    "Metric name (e.g. 'readability_score', 'sentiment')"
    name: String!
    "Numeric score value"
    value: Float!
    "AI-generated explanation of why this score was assigned"
    justification: String!
    "The Text this metric was derived from"
    text: Text
  }

  "A registered AI model tracked for analysis provenance."
  type AIModel {
    id: ID!
    "Model identifier (e.g. 'gemini-2.0-flash', 'text-embedding-004')"
    name: String!
    "Provider name (e.g. 'Google')"
    provider: String!
    "Model class: GENERATIVE | EMBEDDING"
    type: String!
  }

  "A specific versioned instance of a system prompt used to generate a Report."
  type PromptVersion {
    id: ID!
    "Monotonically increasing version number within a PromptTemplate"
    version: Int!
    "The full prompt text that was sent to the AI model"
    content: String!
    "The named template this version belongs to"
    template: PromptTemplate!
  }

  "A named prompt template that groups multiple PromptVersions for change tracking."
  type PromptTemplate {
    id: ID!
    "Unique human-readable name (e.g. 'TEXT_SUMMARY_ENGINE_V1')"
    name: String!
    "What this prompt template is designed to accomplish"
    description: String
  }

  "A key-value label that can be attached to Sources or Texts for classification."
  type Tag {
    id: ID!
    "Tag key (e.g. 'author', 'topic', 'priority', 'region')"
    name: String!
    "Tag value (e.g. 'Tallinn', 'high'). Null for boolean-style presence tags."
    value: String
  }

  "A file attachment linked to a Source or Text."
  type Attachment {
    id: ID!
    "Original filename as uploaded"
    filename: String!
    "MIME type (e.g. 'image/png', 'application/pdf')"
    mimetype: String!
    "Public URL to access the file"
    url: String!
    "File size in bytes"
    size: Int!
  }

  """
  An RSS/Atom feed subscription for automated content discovery.

  When polled, each unseen item URL creates a new Source (status: NEW).
  If aiPrompt is set, the FeedAgentService runs a multi-turn Gemini
  tool-calling pipeline to autonomously approve, discard, tag, or save
  an AI analysis of each new article.
  """
  type Feed {
    "Unique identifier (CUID)"
    id: ID!
    "RSS/Atom feed URL"
    url: String!
    "Human-readable display name"
    name: String!
    "Polling interval in minutes (default: 60)"
    pollingPeriod: Int!
    "Timestamp of the most recent successful poll (ISO string)"
    lastPolledAt: String
    "Source records created from this feed's items"
    sources: [Source!]!
    "Default tag key applied to every new Source created from this feed"
    defaultTagName: String
    "Default tag value applied alongside defaultTagName"
    defaultTagValue: String
    "Gemini system prompt run against every new item via FeedAgentService. Supports tool calling."
    aiPrompt: String
    "Whether automated polling is currently active"
    enabled: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  "Per-feed result summary returned by pollAllFeeds."
  type FeedPollResult {
    feedId: ID!
    name: String!
    "Number of new Source records created in this poll cycle"
    newItems: Int
    "Error message if polling this feed failed"
    error: String
  }

  # ─── Input Types ─────────────────────────────────────────────────────────────

  """
  Input for creating or updating a wiki page (Source + Text in one operation).
  If 'id' is provided, the existing Source is updated. Otherwise a new Source
  is created at the given 'path' within the wiki hierarchy via WikiService.
  """
  input WikiPageInput {
    "ID of an existing Source to update. Omit when creating a new page."
    id: ID
    "Local path slug (e.g. 'agents'). Auto-slugified by the server. Omit to use the generated CUID."
    path: String
    "Display title for the Source node"
    title: String
    "Markdown content written into the linked Text record"
    content: String!
    "BCP-47 language code for the Text (default: 'et')"
    language: String
    "Origin URL if this page was extracted from an external article"
    url: String
    "Formal publication date (ISO string)"
    publishedAt: String
    "Whether to mark this page as publicly published"
    isPublished: Boolean
    "Tags to attach to the Text record (replaces existing tags on update)"
    tags: [TagInput!]
    "ID of a parent Text for the legacy text-fragment hierarchy. Prefer parentId."
    textParentId: ID
    "ID of a parent Source to nest this page under in the wiki tree"
    parentId: ID
  }

  "Input for creating a standalone Source (non-wiki flow)."
  input SourceInput {
    "External URL"
    url: String
    "Display title"
    title: String
    "Short description"
    description: String
    "Source type: WEB | WIKI_PAGE | BOOK | etc."
    type: String!
  }

  "A key-value tag pair used in mutations and filter inputs."
  input TagInput {
    "Tag key (e.g. 'author', 'region')"
    name: String!
    "Tag value. Omit for boolean-style presence tags."
    value: String
  }

  "Filter options for paginated Source queries."
  input WikiFilterInput {
    "Free-text search across title, description, path, and materializedPath"
    search: String
    "Restrict to Sources that have at least one of these tags"
    tags: [TagInput!]
    "Restrict to Sources created on or after this ISO date"
    startDate: String
    "Restrict to Sources created on or before this ISO date"
    endDate: String
  }

  "Filter options for paginated Text queries."
  input TextFilterInput {
    "Free-text search within content"
    search: String
    "Restrict to Texts that have at least one of these tags"
    tags: [TagInput!]
    "Restrict to Texts created on or after this ISO date"
    startDate: String
    "Restrict to Texts created on or before this ISO date"
    endDate: String
    "Restrict to published or unpublished Texts only"
    isPublished: Boolean
  }

  # ─── Queries ──────────────────────────────────────────────────────────────────

  type Query {
    "Returns the currently authenticated user, or null if the token is missing/invalid."
    me: User

    "Fetches a single wiki Source by its full materializedPath (e.g. 'science/ai/agents'). Returns null if the path does not exist."
    wikiPage(path: String!): Source

    "Returns the direct children of a wiki node. Pass parentId: null to get root-level nodes. Used for lazy sidebar tree loading."
    wikiTree(parentId: ID): [Source!]!

    "Paginated, filterable list of all Sources owned by the current user."
    sources(filter: WikiFilterInput, skip: Int, take: Int): SourceConnection!

    "Fetches a single Source by its CUID with full relation includes."
    source(id: ID!): Source

    "Lists all AI analysis Reports, optionally filtered by status string."
    reports(status: String): [Report!]!

    "Fetches a single Report by CUID with all nested includes."
    report(id: ID!): Report

    "Paginated, filterable list of Text records owned by the current user."
    texts(filter: TextFilterInput, skip: Int, take: Int): TextConnection!

    "Fetches a single Text by CUID with originSource, tags, and reports."
    text(id: ID!): Text

    "Returns all Tags in the system (not scoped to the current user)."
    tags: [Tag!]!

    "Lists all active (non-deleted), non-soft-deleted Feed subscriptions owned by the current user."
    feeds: [Feed!]!

    "Paginated Source inbox — Sources with the given status from feeds owned by the current user. Defaults to status: NEW."
    sourcesReview(status: String, skip: Int, take: Int): SourceConnection!
  }

  # ─── Mutations ────────────────────────────────────────────────────────────────

  type Mutation {
    """
    Creates or updates a wiki page (Source + Text) atomically via WikiService.
    Handles path resolution, slug creation, parent linking, and tag management.
    If the materializedPath changes (rename), callers should navigate to the new URL.
    """
    saveWikiPage(input: WikiPageInput!): Source!

    "Hard-deletes a Source and all its child content. Irreversible — use removeSource for a soft-delete."
    deleteWikiPage(id: ID!): Boolean!

    "Creates a directed semantic Relation edge between two Sources."
    addRelation(fromSourceId: ID!, toSourceId: ID!, role: String!, metadata: String): Relation!

    "Permanently removes a Relation edge."
    removeRelation(id: ID!): Boolean!

    "Registers a new RSS/Atom feed. The feed is active by default."
    createFeed(url: String!, name: String!, pollingPeriod: Int, aiPrompt: String): Feed!

    "Updates feed settings: URL, name, polling interval, default tags, or AI prompt."
    updateFeed(id: ID!, url: String, name: String, pollingPeriod: Int, defaultTagName: String, defaultTagValue: String, aiPrompt: String): Feed!

    "Toggles the enabled flag on a feed without deleting it."
    toggleFeed(id: ID!, enabled: Boolean!): Feed!

    "Soft-deletes a feed (sets existent: false). Its Sources are preserved."
    deleteFeed(id: ID!): Boolean!

    "Manually triggers a poll for a single feed. Returns the count of new Sources created."
    pollFeed(id: ID!): Int!

    "Polls all active, enabled feeds and returns a per-feed result summary."
    pollAllFeeds: [FeedPollResult!]!

    "Soft-deletes a Source (sets existent: null). The Source is archived and hidden, not destroyed."
    removeSource(id: ID!): Source!

    "Hard-deletes multiple Sources by CUID. Use with caution — content is permanently lost."
    batchDeleteSources(ids: [ID!]!): Int!

    "Marks multiple Sources as DISCARDED status without hard-deleting them."
    batchDiscardSources(ids: [ID!]!): Int!

    """
    Full article ingestion pipeline for a Source that has a URL:
      1. Scrapes the full article text (ScraperService / Cheerio)
      2. Runs AI summary + author extraction (AIService / Gemini)
      3. Creates a Text record with a linked AI Summary
      4. Generates vector embeddings for RAG (ChunkingService / pgvector)
      5. Sets the Source status to PROCESSED
    Returns the created Text record.
    """
    initializeTextFromSource(id: ID!, topicId: ID): Text!

    "Creates a PENDING Report linked to a Source and Text (uses the latest Text if textId is omitted)."
    analyzePage(sourceId: ID!, textId: ID): Report!

    "Attaches a Tag to a Source or Text. targetType must be 'SOURCE' or 'TEXT'."
    addTag(targetId: ID!, targetType: String!, input: TagInput!): Tag!

    "Detaches a Tag from a Source or Text without deleting the Tag record itself."
    removeTag(tagId: ID!, targetId: ID!, targetType: String!): Boolean!

    """
    Developer tool: runs the full FeedAgentService agentic pipeline against any
    URL with a custom Gemini prompt. Finds or creates a Source, then lets the AI
    autonomously scrape, approve/discard, tag, and save an analysis via tool calling.
    Returns the Source reflecting all actions the agent performed.
    """
    processUrlWithPrompt(url: String!, prompt: String!): Source!
  }
`;
