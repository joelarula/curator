import { gql } from 'graphql-tag';

/**
 * schema/index.ts
 *
 * GraphQL SDL type definitions for the Curator knowledge platform.
 *
 * Architecture overview:
 *   Resource — Core identity node. Every piece of knowledge is anchored to a
 *              Resource with a unique URI (and optional URL). Resources have
 *              integer primary keys for triple-join performance.
 *   Text     — Content layer. A Resource can have many Text records with
 *              different roles (MAIN, SUMMARY, TRANSCRIPT).
 *   Relation — RDF triple: subject → predicate → object. All three positions
 *              reference Resource nodes (including predicates like rdf:type).
 *   Prompt   — Materialized AI prompt with template, model, and resource context.
 *   Request  — Queued agentic request (status lifecycle: NEW→WAITING→COMPLETED/FAILED).
 *   Response — AI response with parsed Relations and raw tool call output.
 *   Agent    — Polling agent with schedule and prompt template.
 *
 * All queries and mutations require a valid Bearer JWT (Google OAuth).
 */
export const typeDefs = gql`
  scalar JSON

  "Represents a tool call execution instruction"
  type ToolCall {
    name: String!
    args: JSON
  }

  "Input for a tool call execution instruction"
  input ToolCallInput {
    name: String!
    args: JSON
  }

  # ─── Auth ────────────────────────────────────────────────────────────────────

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
    "Google OAuth subject ID"
    googleId: String
    createdAt: String!
    updatedAt: String!
  }

  # ─── Lookup Tables ──────────────────────────────────────────────────────────

  "Lookup: resource classification — ENTITY, PROPERTY, CLASS, etc."
  type ResourceType {
    id: Int!
    name: String!
  }

  "Lookup: resource lifecycle status — NEW, ACTIVE, ARCHIVED, etc."
  type ResourceStatus {
    id: Int!
    name: String!
  }

  "Lookup: text role — MAIN, SUMMARY, TRANSCRIPT, etc."
  type TextRole {
    id: Int!
    name: String!
  }

  # ─── Core Types ─────────────────────────────────────────────────────────────

  """
  The core identity node of the knowledge graph.

  A Resource is a stable, addressable piece of knowledge — an entity, a property,
  a class, a web article, a concept, etc. Resources use integer primary keys
  for optimal triple-store join performance.

  The 'uri' field is the stable external identifier (RDF-compatible).
  The 'url' field is an optional web URL for external resources.
  """
  type Resource {
    "Auto-incrementing integer primary key (optimized for triple joins)"
    id: Int!
    "Unique RDF-compatible URI identifier"
    uri: String!
    "Human-readable display title"
    title: String
    "Short description"
    description: String
    "Whether this resource is publicly visible"
    isPublished: Boolean!
    "Lifecycle status (NEW, ACTIVE, ARCHIVED, etc.)"
    status: ResourceStatus
    "Classification type (ENTITY, PROPERTY, CLASS, etc.)"
    resourceType: ResourceType
    "Owner user"
    user: User!

    "Content records attached to this resource"
    texts: [Text!]!
    "File attachments linked to this resource"
    attachments: [Attachment!]!

    "RDF triples where this resource is the subject"
    subjectRelations: [Relation!]!
    "RDF triples where this resource is the predicate/property"
    predicateRelations: [Relation!]!
    "RDF triples where this resource is the object"
    objectRelations: [Relation!]!

    "Prompts that reference this resource as context"
    prompts: [Prompt!]!

    "Soft-delete flag (true = active, null = archived)"
    existent: Boolean
    createdAt: String!
    updatedAt: String!
  }

  "Paginated list of Resource nodes."
  type ResourceConnection {
    items: [Resource!]!
    totalCount: Int!
  }

  """
  A versioned content record attached to a Resource.

  Each Text has a role (MAIN, SUMMARY, TRANSCRIPT) defining its purpose.
  Multiple Texts on the same Resource support versioning and multi-role content.
  """
  type Text {
    "Unique identifier"
    id: Int!
    "Full text content"
    content: String!
    "Content role (MAIN, SUMMARY, TRANSCRIPT)"
    role: TextRole!
    "Whether this text is publicly visible"
    isPublished: Boolean!
    "The Resource this text belongs to"
    resource: Resource
    "The user who authored this text"
    user: User!
    "Soft-delete flag"
    existent: Boolean
    createdAt: String!
    updatedAt: String!
  }

  "Paginated list of Text records."
  type TextConnection {
    items: [Text!]!
    totalCount: Int!
  }

  """
  An RDF triple: subject → predicate → object.

  All three positions (subject, predicate, object) reference Resource nodes.
  The predicate is itself a Resource with resourceType = PROPERTY.

  Example: Resource(Alice) --predicate:Resource(knows)--> Resource(Bob)

  Supports optional literal values (Float), text selection ranges,
  and justification strings for AI-generated triples.
  """
  type Relation {
    "Auto-incrementing integer primary key"
    id: Int!
    "Classification type of this relation"
    resourceType: ResourceType!
    "Subject Resource (integer FK for join performance)"
    subject: Resource!
    "Predicate Resource — the property/relationship type"
    predicate: Resource!
    "Object Resource — the target of the assertion"
    object: Resource!
    "Optional numeric literal value for quantitative assertions"
    literalValue: Float
    "Optional text selection start offset"
    selectionStart: Int
    "Optional text selection end offset"
    selectionEnd: Int
    "Optional AI-generated justification for this triple"
    justification: String
    "AI Response that generated this triple (null for manual triples)"
    response: Response
    createdAt: String!
  }

  "A file attachment linked to a Resource."
  type Attachment {
    id: ID!
    "Unique URI identifier"
    uri: String!
    "Original filename"
    filename: String!
    "MIME type (e.g. 'image/png', 'application/pdf')"
    mimetype: String!
    "Public URL to access the file"
    url: String!
    "File size in bytes"
    size: Int!
    "Parent resource"
    resource: Resource
    createdAt: String!
  }

  # ─── Agentic Pipeline Types ─────────────────────────────────────────────────

  "A registered AI model tracked for prompt provenance."
  type AIModel {
    id: ID!
    "Unique URI identifier"
    uri: String!
    "Model name (e.g. 'gemini-2.0-flash')"
    name: String!
    "Provider name (e.g. 'Google')"
    provider: String!
    "Model version string"
    version: String
  }

  "A named prompt template that groups materialized Prompts for reuse."
  type PromptTemplate {
    id: ID!
    "Human-readable template name"
    name: String!
    "Template prompt text"
    prompt: String
    "Tool calls definitions or execution instructions"
    toolCalls: [ToolCall!]
    "Owner user"
    user: User!
    "Materialized prompts derived from this template"
    prompts: [Prompt!]!
    createdAt: String!
  }

  """
  A materialized AI prompt: template + model + resource context.

  Created when a user submits a prompt for processing. Links to the
  PromptTemplate used, the AIModel targeted, and the Resource(s)
  provided as context.
  """
  type Prompt {
    id: Int!
    "Unique URI identifier"
    uri: String!
    "PromptTemplate used to generate this prompt"
    template: PromptTemplate!
    "AIModel targeted for processing"
    aiModel: AIModel
    "Owner user"
    user: User!
    "Materialized prompt text sent to the AI"
    prompt: String
    "Tool call definitions or execution instructions"
    toolCalls: [ToolCall!]
    "Resources provided as context"
    resources: [Resource!]!
    "Requests that use this prompt"
    requests: [Request!]!
    createdAt: String!
  }

  """
  A queued agentic request.

  Lifecycle: NEW → WAITING → COMPLETED | FAILED
  Supports retry counting and distributed locking via lockedBy/lockedAt.
  """
  type Request {
    id: Int!
    "Processing status"
    status: RequestStatus!
    "Number of retry attempts"
    retryCount: Int!
    "The prompt to process"
    prompt: Prompt
    "Parent conversation"
    conversation: Conversation!
    "When this request is scheduled to run"
    scheduledAt: String!
    "Worker lock holder ID"
    lockedBy: String
    "When the lock was acquired"
    lockedAt: String
    "AI responses to this request"
    responses: [Response!]!
    createdAt: String!
    updatedAt: String!
  }

  """
  An AI response to a Request.

  Contains the raw AI output, parsed tool calls, and the RDF Relations
  extracted by the AI agent.
  """
  type Response {
    id: Int!
    "Parent request"
    request: Request!
    "Parent conversation"
    conversation: Conversation!
    "Raw AI response content"
    content: String!
    "Tool call results (JSON serialized)"
    toolCalls: String
    "RDF triples extracted from this response"
    relations: [Relation!]!
    createdAt: String!
  }

  "A conversation grouping multiple Requests and Responses."
  type Conversation {
    id: Int!
    "Requests in this conversation"
    requests: [Request!]!
    "Responses in this conversation"
    responses: [Response!]!
    "Soft-delete flag"
    existent: Boolean
    createdAt: String!
    updatedAt: String!
  }

  """
  A polling agent with a prompt template and schedule.

  Agents periodically poll a URL and create Requests for processing.
  """
  type Agent {
    id: ID!
    "Human-readable name"
    name: String!
    "PromptTemplate linked to this agent"
    template: PromptTemplate!
    "Natural language schedule (e.g. 'every 5 minutes', 'at 12:00pm')"
    schedule: String!
    "Timestamp of last successful poll"
    lastPolledAt: String
    "Owner user"
    user: User!
    "Whether polling is active"
    enabled: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  "Request processing status lifecycle."
  enum RequestStatus { NEW WAITING COMPLETED FAILED }

  # ─── Input Types ─────────────────────────────────────────────────────────────

  "Input for creating or updating a Resource."
  input ResourceInput {
    "Optional integer ID (for upsert/update)"
    id: Int
    "Unique RDF-compatible URI"
    uri: String
    "Display title"
    title: String
    "Short description"
    description: String
    "ResourceType lookup ID"
    resourceTypeId: Int
    "ResourceType lookup name (e.g. 'FEED', 'LOCATION')"
    resourceTypeName: String
    "ResourceStatus lookup ID"
    statusId: Int
    "ResourceStatus lookup name (e.g. 'DRAFT', 'ACTIVE')"
    statusName: String
    "Whether publicly visible"
    isPublished: Boolean
  }

  "Input for creating an RDF triple."
  input RelationInput {
    "ResourceType lookup ID for the relation"
    resourceTypeId: Int
    "ResourceType lookup name (e.g. 'PROPERTY')"
    resourceTypeName: String
    "Subject Resource integer ID"
    subjectId: Int!
    "Predicate Resource integer ID"
    predicateId: Int!
    "Object Resource integer ID"
    objectId: Int!
    "Optional numeric literal value"
    literalValue: Float
    "Optional text selection start offset"
    selectionStart: Int
    "Optional text selection end offset"
    selectionEnd: Int
    "Optional justification text"
    justification: String
    "Optional Response ID that generated this triple"
    responseId: ID
  }

  "Input for creating a materialized Prompt."
  input PromptInput {
    "Unique URI"
    uri: String!
    "PromptTemplate ID"
    templateId: ID!
    "Target AIModel ID (optional)"
    aiModelId: ID
    "Materialized prompt text sent to the model"
    prompt: String
    "Tool call definitions or execution instructions"
    toolCalls: [ToolCallInput!]
    "Resource integer IDs to attach as context"
    resourceIds: [Int!]
  }

  "Input for creating or updating an Agent."
  input AgentInput {
    "Human-readable name"
    name: String
    "PromptTemplate ID"
    templateId: ID
    "Natural language schedule (e.g. 'every 5 minutes')"
    schedule: String
  }

  "Input for upserting an Agent and its PromptTemplate."
  input UpsertAgentWithTemplateInput {
    "Agent name (used for unique matching)"
    agentName: String!
    "Natural language schedule"
    schedule: String!
    "PromptTemplate name (used for unique matching)"
    templateName: String!
    "Template prompt text"
    prompt: String
    "Tool calls definitions or execution instructions"
    toolCalls: [ToolCallInput!]
  }

  "Runtime state of the background agent workers"
  type AgentWorkerState {
    schedulerRunning: Boolean!
    processorRunning: Boolean!
    activeBreeJobs: Int!
    requestsProcessed: Int!
  }

  # ─── Queries ──────────────────────────────────────────────────────────────────

  type Query {
    "Returns the currently authenticated user, or null if the token is invalid."
    me: User
    
    "Returns the runtime health and statistics of the background workers."
    agentWorkerState: AgentWorkerState!

    # Resource queries (integer IDs)
    "Fetch a single Resource by integer ID."
    resource(id: Int!): Resource
    "Fetch a single Resource by its URI."
    resourceByUri(uri: String!): Resource
    "Paginated, filterable list of Resources owned by the current user."
    resources(typeId: Int, statusId: Int, search: String, skip: Int, take: Int): ResourceConnection!

    # Text queries
    "Paginated list of Text records, optionally filtered by resource or role."
    texts(resourceId: Int, roleId: Int, skip: Int, take: Int): TextConnection!
    "Fetch a single Text by CUID."
    text(id: ID!): Text

    # Relation queries (RDF graph traversal with integer resource IDs)
    "Query RDF triples by subject, predicate, and/or object Resource IDs."
    relations(subjectId: Int, predicateId: Int, objectId: Int, skip: Int, take: Int): [Relation!]!
    "Fetch a single Relation by CUID."
    relation(id: ID!): Relation

    # Lookup tables
    "All resource type definitions."
    resourceTypes: [ResourceType!]!
    "All resource status definitions."
    resourceStatuses: [ResourceStatus!]!
    "All text role definitions."
    textRoles: [TextRole!]!

    # Agentic pipeline
    "Paginated list of Prompts."
    prompts(skip: Int, take: Int): [Prompt!]!
    "Fetch a single Prompt by CUID."
    prompt(id: ID!): Prompt
    "All prompt templates for the current user."
    promptTemplates: [PromptTemplate!]!
    "Fetch a specific prompt template by name. User ID defaults to current user."
    promptTemplate(name: String!, userId: ID): PromptTemplate
    "Paginated list of Conversations."
    conversations(skip: Int, take: Int): [Conversation!]!
    "Fetch a single Conversation by CUID."
    conversation(id: ID!): Conversation
    "Paginated list of Requests, optionally filtered by status."
    requests(status: RequestStatus, skip: Int, take: Int): [Request!]!
    "All agents for the current user."
    agents: [Agent!]!
    "Fetch a specific agent by name. User ID defaults to current user."
    agent(name: String!, userId: ID): Agent
  }

  # ─── Mutations ────────────────────────────────────────────────────────────────

  type Mutation {
    # Resource lifecycle (integer IDs)
    "Create a new Resource."
    createResource(input: ResourceInput!): Resource!
    "Update an existing Resource by integer ID."
    updateResource(id: Int!, input: ResourceInput!): Resource!
    "Upsert a Resource (create if URI missing, update if URI exists)."
    upsertResource(input: ResourceInput!): Resource!
    "Soft-delete a Resource (sets existent to null)."
    deleteResource(id: Int!): Boolean!

    # Text management
    "Create a new Text record for a Resource."
    createText(resourceId: Int!, content: String!, roleId: Int!): Text!
    "Update an existing Text's content."
    updateText(id: ID!, content: String!): Text!

    # RDF Relations
    "Create a new RDF triple (Relation)."
    createRelation(input: RelationInput!): Relation!
    "Delete a Relation by CUID."
    deleteRelation(id: ID!): Boolean!

    # Agentic pipeline
    "Create a new PromptTemplate."
    createPromptTemplate(name: String!, prompt: String, toolCalls: [ToolCallInput!]): PromptTemplate!
    "Create a materialized Prompt."
    createPrompt(input: PromptInput!): Prompt!
    "Submit a Request for processing (creates with status NEW)."
    submitRequest(promptId: ID!, conversationId: ID): Request!
    "Create a new Conversation."
    createConversation: Conversation!

    # Agent management
    "Create a new polling Agent."
    createAgent(input: AgentInput!): Agent!
    "Update an existing Agent."
    updateAgent(id: ID!, input: AgentInput!): Agent!
    "Toggle an Agent's enabled status."
    toggleAgent(id: ID!, enabled: Boolean!): Agent!
    "Manually trigger an Agent to create a Request."
    triggerAgent(id: ID!): Request!
    "Upsert an Agent and its PromptTemplate together in one call. Matches by name."
    upsertAgentWithTemplate(input: UpsertAgentWithTemplateInput!): Agent!

    # Lookup seed mutations (admin)
    "Create a new ResourceType."
    createResourceType(name: String!): ResourceType!
    "Create a new ResourceStatus."
    createResourceStatus(name: String!): ResourceStatus!
    "Create a new TextRole."
    createTextRole(name: String!): TextRole!
  }
`;
