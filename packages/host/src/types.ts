import type { CuratorHostEvents, CuratorEvent, CuratorEventType } from './events/CuratorHostEvents.js';
import type { ConversationRouter } from '@curator/agent-server';
import type { ResolvedHostPolicy } from './hostPolicy.js';

export type { CuratorHostEvents, CuratorEvent, CuratorEventType };

export interface PluginRegistrationContext {
  dataDir: string;
  domainDb?: unknown;
}

export interface CuratorLogger {
  log?: (...args: any[]) => void;
  info?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
}

export interface CuratorDbConfig {
  path?: string;
  url?: string;
  forceReset?: boolean;
}

export interface CuratorHostRbacConfig {
  managers?: string[];
}

export type CuratorHostProfile = 'server' | 'embedded' | 'ephemeral';

export interface CuratorDefinitionsPolicy {
  /** 'code': code definitions are re-seeded as versions; 'database': DB edits win, seeding only creates missing scripts. */
  owner?: 'code' | 'database';
  /** When a code script differs from the active DB version (owner='code'). */
  onDrift?: 'update' | 'keep' | 'error';
}

export interface CuratorRetentionPolicy {
  /** Prune completed read-only tool Requests (Responses cascade). Workflow Requests are never auto-pruned. */
  readOnlyRequests?: 'keep' | 'prune';
  readOnlyTtlMs?: number;
}

export interface CuratorHostConfig {
  name: string;
  projectId?: string;
  projectName?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  autoSeed?: boolean;
  forceReset?: boolean;
  dataDir?: string;
  curatorDb?: CuratorDbConfig;
  intervalMs?: number;
  domainDb?: unknown;
  logger?: CuratorLogger;
  rbac?: CuratorHostRbacConfig;
  /** Persistence profile; defaults to 'embedded'. Individual policies below override profile defaults. */
  profile?: CuratorHostProfile;
  definitions?: CuratorDefinitionsPolicy;
  retention?: CuratorRetentionPolicy;
  /** 'reference': Requests point to scriptId+scriptVersion; 'snapshot': Requests carry the full AST. */
  astStorage?: 'reference' | 'snapshot';
  /** Default lifetime of approval waits in ms (0 = never expire). Default 24h; Curator_Tool `approvalTtlMs` overrides. */
  approvalTtlMs?: number;
  registerPlugins?: (ctx: PluginRegistrationContext) => Promise<any> | any;
}

export interface CuratorRoleDefinition {
  name: string;
  description?: string;
  subRoles?: string[];
  tools?: string[];
  accessLevel?: string;
}

export interface SeedResult {
  seededRoles?: string[];
  seededTools: string[];
  seededScripts: string[];
  seededAgents: string[];
  databasePath?: string;
}

export type HostRequestOrigin = 'REPL' | 'CLI' | 'API' | 'MCP' | 'GRAPHQL';

/** Actor/scope overrides; defaults come from the host session (user, project, default conversation). */
export interface HostRequestScope {
  conversationId?: number;
  userId?: string;
  projectId?: string;
  agentId?: string;
  origin?: HostRequestOrigin;
}

export interface HostRunToolOptions extends HostRequestScope {
  /** Runtime-only args merged at execution, never persisted (e.g. derived state). */
  runtimeArgs?: Record<string, any>;
  /** Runtime-only toolContext values. */
  runtimeContext?: Record<string, any>;
  /** Extra persisted Request context (e.g. sessionId). */
  context?: Record<string, any>;
  /** Broadcast `result.event` from the core (default true). */
  broadcastToolEvents?: boolean;
}

export interface HostEmitEventOptions extends HostRequestScope {
  targetAgentId?: string;
  /** Extra wait matching beyond exact `waitEvent === eventName`. */
  matchWait?: (waitEvent: string | undefined, eventName: string, payload: any) => boolean;
  waitValue?: (payload: any) => any;
  contextPatch?: Record<string, any>;
  /** Also broadcast on host events (default true). */
  broadcast?: boolean;
}

export interface CuratorHost {
  config: CuratorHostConfig;
  /** Persistence policy resolved from `config.profile` plus explicit overrides. */
  policy: ResolvedHostPolicy;
  /**
   * Runs one tool call as a Request (RBAC, approval, Response). Throws on tool error / access denied;
   * `status: 'WAITING_FOR_USER'` when approval is required.
   */
  runTool(toolName: string, args?: Record<string, any>, opts?: HostRunToolOptions): Promise<{ requestId: number; status: string; result: any; record?: any }>;
  /** Emits one event as a Request (EVENT_EMITTED Response): spawns subscriptions and resumes waits. */
  emitEvent(eventName: string, payload?: any, opts?: HostEmitEventOptions): Promise<{ requestId: number; eventName: string; spawned: number[]; woken: number[] }>;
  events: CuratorHostEvents;
  prisma: any;
  processor: any;
  engine: any;
  conversations: ConversationRouter;
  user: any;
  project: any;
  start(intervalMs?: number): Promise<void>;
  stop(): Promise<void>;
  gracefulShutdown(): Promise<void>;
  seed(): Promise<SeedResult>;
  triggerAgent(name: string, context?: Record<string, any>): Promise<any>;
  pauseRequest(requestId: number | string): Promise<any>;
  resumeRequest(requestId: number | string): Promise<any>;

  // Multi-Project & Project-Scoped RBAC APIs
  createProject(options: {
    id?: string;
    name: string;
    userId?: string;
    description?: string;
    roles?: string[];
    assignDefaultRolesToUser?: boolean;
  }): Promise<{ project: any; conversation: any; projectRoles: string[] }>;
  listProjects(): Promise<any[]>;
  getProject(projectId: string): Promise<any | null>;
  assignUserProjectRole(userId: string, roleName: string, projectId: string): Promise<any>;
  getUserProjectRoles(userId: string, projectId: string): Promise<string[]>;
}

export interface CuratorToolDefinition {
  name: string;
  description?: string;
  parameters?: any;
  requiredRole?: string;
  accessLevel?: string;
  execute?: (args: any, ctx?: any) => Promise<any>;
  runAsync?: (ctx: any) => Promise<any>;
  aliases?: string[];
  usage?: string;
}

export interface ReplCommand {
  name: string;
  aliases?: string[];
  description?: string;
  usage?: string;
  execute: (args: string, tokens: string[], ctx: ClientShellConfig) => Promise<any> | any;
}

export interface ActiveChoice {
  id?: string;
  label: string;
  tool?: string;
  args?: Record<string, any>;
  action?: any;
  value?: any;
  event?: string;
  payload?: any;
  aliases?: string[];
  usage?: string;
  description?: string;
  blocking?: boolean;
  parse?: (args: string, tokens: string[], ctx: ClientShellConfig) => any;
  execute?: (args: string, tokens: string[], ctx: ClientShellConfig) => any;
}

export interface ClientShellConfig<TState = any, _TAction = any> {
  actorName?: string;
  conversationId?: string;
  roomUri?: string;
  channel?: import('./client/curatorChannel.js').CuratorChannel;
  commands?: ReplCommand[];
  availableTools?: (string | CuratorToolDefinition)[];
  tools?: (string | CuratorToolDefinition)[];
  defaultToolName?: string;
  prompt?: string | (() => string);
  getState?: () => TState | null;
  redrawView?: () => void;
  onToolCall?: (toolName: string, args: Record<string, any>, ctx?: ClientShellConfig<TState, _TAction>) => Promise<any>;
  onSpeech?: (text: string, speechAct?: string, targetId?: string) => Promise<any>;
  onAction?: (action: any, tokens?: string[], ctx?: ClientShellConfig<TState, _TAction>) => Promise<any>;
  onChoice?: (choice: any, ctx?: ClientShellConfig<TState, _TAction>) => Promise<any>;
  onCommand?: (command: string, args: string) => Promise<boolean | void>;
  logTurn?: (msg: string) => Promise<void>;
  hint?: string;
}

// Backward-compatible type aliases to prevent consumer breakage
export type ToolAction<TArgs = any> = Record<string, any> & {
  tool?: string;
  type?: string;
  args?: TArgs;
  amount?: number;
};
export type CommandOutcome<TAction = ToolAction> =
  | { type: 'ACTION'; value: TAction }
  | { type: 'HANDLED'; message?: string }
  | void
  | null;
export type ShellCommand<TAction = any> = ReplCommand & {
  id?: string;
  label?: string;
  value?: TAction;
  parse?: (args: string, tokens: string[], ctx: ClientShellConfig) => any;
  execute?: (args: string, tokens: string[], ctx: ClientShellConfig) => any;
};
export type ChatToolDefinition = CuratorToolDefinition;
export type ShellContext<TAction = any> = ClientShellConfig<any>;
export type GroupChatContext = ClientShellConfig;


