import type { CuratorHostEvents, CuratorEvent, CuratorEventType } from './events/CuratorHostEvents.js';
import type { ConversationRouter } from '@curator/agent-server';

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

export interface CuratorHost {
  config: CuratorHostConfig;
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


