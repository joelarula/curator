import type { PrismaClient } from '@prisma/client';
import type { CuratorAstNode } from './CuratorAst.js';
import type { CuratorTool } from '../tools/CuratorTool.js';
import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';
import type { StateProjector } from './ConversationStateLog.js';
import type { NodeHandler, ServiceBinding, MaintenanceSystem } from './nodes/NodeHandler.js';
import type { CuratorFormatter, ToolOutputRules } from './output/OutputFormats.js';

export type JsonRecord = Record<string, unknown>;

export interface CuratorExecutionContext {
  input?: unknown;
  state?: JsonRecord;
  [key: string]: unknown;
}

export interface CuratorRequestRecord {
  id: number;
  userId: string | number;
  projectId?: string | number | null;
  conversationId: number | string;
  ast: unknown;
  context?: CuratorExecutionContext | null;
  notifyId?: number | null;
  pendingDependencies: number;
  retryCount: number;
  status: string;
  priority: number;
  lockedBy?: string | null;
  lockedAt?: Date | null;
}

export interface CuratorResponseRecord {
  id: number;
  requestId: number;
  userId?: string | number;
  projectId?: string | number | null;
  conversationId: number | string;
  ast?: unknown;
  context?: CuratorExecutionContext | null;
  content?: string | null;
  state?: JsonRecord | null;
  durationMs?: number | null;
  cost?: number | null;
  status?: string;
  errorMessage?: string | null;
  retryCount?: number;
  createdAt: Date;
  completedAt?: Date | null;
}

export interface CuratorScriptDefinition {
  name: string;
  description?: string;
  body?: string;
  ast?: CuratorAstNode;
  run: (context: CuratorExecutionContext) => Promise<unknown>;
}

export type CuratorScriptInput = CuratorScriptDefinition | string;

export const CuratorSystemRole = {
  ADMIN: 'system:admin',
  AGENT_ADMIN: 'agent:admin',
  AGENT_READER: 'agent:reader',
} as const;
export type CuratorSystemRole = (typeof CuratorSystemRole)[keyof typeof CuratorSystemRole];

export interface CuratorRoleDefinition {
  /** Unique role identifier, e.g. 'poker:dealer', 'poker:player', 'poker:spectator' */
  name: string;
  /** Human-readable explanation of duties and privileges */
  description?: string;
  /** Composable sub-roles that this role encompasses (RoleInheritance) */
  subRoles?: string[];
  /** Whitelisted tools explicitly granted to this role */
  tools?: string[];
  /** Default maximum tool access level permitted */
  accessLevel?: string;
}

export interface CuratorAgentDefinition {
  description?: string;
  ast?: CuratorAstNode;
  sourceCode?: string;
  schedule?: string;
  enabled?: boolean;
  toolName?: string;
  args?: Record<string, unknown>;
  /** Array of role names assigned to this agent (whitelist-based access) */
  roles?: string[];
  [key: string]: any;
}

export interface CuratorPluginMcpPolicy {
  /** Expose all tools from this plugin on MCP (overrides per-tool default) */
  exposeAll?: boolean;
  /** Only expose these tool keys */
  include?: string[];
  /** Never expose these tool keys */
  exclude?: string[];
}

/**
 * A pure, deterministic function run by `Curator_Reduce` nodes: arguments in, state fields out.
 * No I/O and no identity: anything that needs the database or the session user is a tool.
 */
export type CuratorReducer = (args: Record<string, any>) => Record<string, any>;

/** One event of a `Curator_EmitEvents` list. */
export interface CuratorEventSpec {
  name: string;
  payload?: any;
  targetAgentId?: number | string;
}

/** Read-only configuration workflows see as `$config` (plain JSON, namespaced by plugin or domain). */
export type CuratorConfig = Record<string, any>;

export interface CuratorPluginDefinition {
  name: string;
  version?: string;
  description?: string;
  tools?: Record<string, CuratorTool> | CuratorTool[];
  /** Pure functions workflows run with `reduce(name, args)` (see CuratorReducer). */
  reducers?: Record<string, CuratorReducer>;
  /** Output formatters usable in format specs by name (`pick:title`, `my_formatter`); replaces a same-named one. */
  formatters?: Record<string, CuratorFormatter>;
  /** How tool results are formatted for the model (`llm`) and people (`display`), by tool name or `*` pattern. */
  toolOutput?: ToolOutputRules;
  /**
   * Default configuration, keyed by namespace (e.g. `{ poker: { talk: {...} } }`). Workflows read it as
   * `$config.<namespace>...`; values the host sets with `engine.setConfig` win over these defaults.
   */
  config?: CuratorConfig;
  models?: SemanticNodeShape[];
  scripts?: Record<string, CuratorScriptInput> | CuratorScriptInput[];
  agents?: Record<string, CuratorAgentDefinition | CuratorAstNode>;
  /** Domain roles and permissions defined by this plugin */
  roles?: Record<string, CuratorRoleDefinition> | CuratorRoleDefinition[];
  /** Default roles assigned to human users connecting to this plugin domain */
  defaultUserRoles?: string[];
  /** Roles assigned to the host system user */
  systemRoles?: string[];
  llmProviders?: Record<string, any>;
  vocabularies?: Record<string, (...args: any[]) => CuratorAstNode | any>;
  mcp?: CuratorPluginMcpPolicy;
  /** Read models derived from conversation state; run inside every state event's transaction. */
  stateProjectors?: StateProjector[];
  /** Plugin AST node types (names must not start with 'Curator_'); usable anywhere in a workflow. */
  nodeHandlers?: NodeHandler[];
  /** Services node handlers and maintenance systems reach with `ctx.service(key)`; build entries with `provide(key, value)`. */
  services?: ServiceBinding[];
  /** Passes appended (in registration order) to every processor's poll schedule. */
  maintenanceSystems?: MaintenanceSystem[];
  onInit?: (context: any) => Promise<void> | void;
  onDestroy?: () => Promise<void> | void;
}

// ── DB-driven execution contracts ──────────────────────────────────────────
// Every event, tool call and choice is a Request row; what happened is a
// structured Response row. No separate event or audit tables.

/** Where a Request came from. Stored in `Request.context.origin`. */
export type CuratorRequestOrigin = 'AST' | 'REPL' | 'CLI' | 'API' | 'MCP' | 'GRAPHQL';

/** Machine-readable kind of a structured Response (`Response.content` JSON). */
export type CuratorResponseRecordType =
  | 'TOOL_RESULT'
  | 'TOOL_BLOCKED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_EXPIRED'
  | 'EVENT_EMITTED'
  | 'EVENTS_EMITTED'
  | 'CHOICE_PROMPT'
  | 'CHOICE_RECEIVED'
  | 'HUMAN_TIMEOUT'
  | 'WAIT_TIMEOUT'
  | 'SUBSCRIBED'
  | 'UNSUBSCRIBED'
  | 'MODEL_CHANGED'
  | 'TOOL_CALLS';

/** A change to a Curator core model (Agent, Script, Role, Tool, ...) recorded as a Request + MODEL_CHANGED Response. */
export interface CuratorModelChange {
  /** Model name, e.g. 'AGENT', 'SCRIPT', 'ROLE', 'TOOL_APPROVAL'. */
  entityType: string;
  entityId: string;
  /** e.g. 'AGENT_CREATED', 'AGENT_UPDATED', 'AGENT_DELETED', 'ROLE_ASSIGNED'. */
  action: string;
  /** Changed fields (new values) or a compact description of the change. */
  changes?: JsonRecord;
}

/** Result of an emit_event Request: which requests were created or resumed. */
export interface CuratorEventEmitResult {
  eventName: string;
  /** Child Request ids spawned from event subscriptions. */
  spawned: number[];
  /** Parked Request ids resumed by this event. */
  woken: number[];
}

/**
 * Structured payload serialized into `Response.content` when a step must be
 * machine-readable (audit, event delivery). Free-text content stays valid for LLM output.
 */
export interface CuratorStructuredResponse {
  type: CuratorResponseRecordType;
  ok?: boolean;
  tool?: string;
  reason?: string;
  roles?: string[];
  approvalScope?: string | null;
  event?: CuratorEventEmitResult;
  /** One entry per event of an EVENTS_EMITTED list, in emission order. */
  events?: CuratorEventEmitResult[];
  /** Choice id for CHOICE_RECEIVED. */
  choiceId?: string;
  /** ISO time an approval wait expires (APPROVAL_REQUIRED) or expired (APPROVAL_EXPIRED). */
  expiresAt?: string;
  /** ISO deadline a human prompt waited for (HUMAN_TIMEOUT). */
  deadline?: string;
  /** Core model change (MODEL_CHANGED). */
  change?: CuratorModelChange;
  /** An agent turn's tool calls as the model made them (TOOL_CALLS); its results follow as `[Tool Result: name]` Responses, in order. */
  calls?: { id: string; name: string; args: Record<string, unknown> }[];
  /** Text the model sent along with its tool calls (TOOL_CALLS). */
  text?: string;
  metadata?: JsonRecord;
}

/** Reply to a parked choice prompt. `requestId` is the parked Request id (the resume token). */
export interface CuratorChoiceReply {
  requestId: number;
  choiceId?: string;
  payload?: unknown;
}

export interface CuratorDatabaseContext {
  prisma?: PrismaClient;
}