import type { CuratorHostEvents, CuratorEvent, CuratorEventType } from './events/CuratorHostEvents.js';
import type { ConversationRouter } from '../../../curator/dist/src/index.js';

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

export interface SeedResult {
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
}

export type SpeechAct =
  | 'TABLE_TALK'
  | 'PROPOSE'
  | 'INFORM'
  | 'QUESTION'
  | 'ANSWER'
  | 'COMMIT'
  | 'CHALLENGE'
  | 'WHISPER'
  | 'BANTER'
  | string;

export interface ChatParticipant {
  id: string;
  name: string;
  isHuman?: boolean;
  role?: string;
}

export interface ChatToolDefinition {
  name: string;
  description?: string;
  execute?: (args: any) => Promise<any>;
}

export interface ToolAction<TArgs = any> {
  tool?: string;
  type?: string;
  args?: TArgs;
  amount?: number;
  [key: string]: any;
}

export type CommandOutcome<TAction = ToolAction> =
  | { type: 'ACTION'; value: TAction }
  | { type: 'HANDLED'; message?: string }
  | void
  | null;

export interface ShellCommand<TAction = any> {
  name?: string;
  id?: string;
  label?: string;
  value?: TAction;
  aliases?: string[];
  syntax?: string;
  usage?: string;
  description?: string;
  parse?: (
    args: string,
    tokens: string[],
    ctx: ClientShellConfig
  ) => TAction | Promise<TAction> | null | undefined;
  execute?: (
    args: string,
    tokens: string[],
    ctx: ClientShellConfig
  ) => Promise<CommandOutcome<TAction>> | CommandOutcome<TAction>;
}

export interface ChatActionCommand<T = any> {
  name: string;
  id?: string;
  aliases?: string[];
  syntax?: string;
  usage?: string;
  description?: string;
  parse?: (
    args: string,
    tokens: string[],
    ctx: ClientShellConfig
  ) => T | Promise<T> | null | undefined;
  execute?: (
    args: string,
    tokens: string[],
    ctx: ClientShellConfig
  ) => Promise<any> | any;
}

export interface ChatChoice<T = any> {
  id?: string;
  name?: string;
  label?: string;
  description?: string;
  value?: T;
  aliases?: string[];
  syntax?: string;
  usage?: string;
  parse?: (
    args: string,
    tokens: string[],
    ctx: ClientShellConfig
  ) => T | Promise<T> | null | undefined;
  execute?: (
    args: string,
    tokens: string[],
    ctx: ClientShellConfig
  ) => Promise<any> | any;
}

export interface ChatVerbDefinition {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  speechAct?: SpeechAct;
  directed?: boolean;
  handler?: (
    args: string,
    ctx: ClientShellConfig,
    target?: ChatParticipant
  ) => Promise<boolean | void | { aiReply?: string }>;
}

export interface ClientShellConfig<TState = any, TAction = ToolAction> {
  actorName?: string;
  conversationId?: string;
  roomUri?: string;
  defaultSpeechAct?: SpeechAct;
  helpHeader?: string;
  commands?: ShellCommand<TAction>[];
  availableTools?: (string | ChatToolDefinition)[];
  availableVerbs?: ChatVerbDefinition[];
  actionCommands?: (ShellCommand<TAction> | ChatActionCommand<TAction>)[];
  participants?: ChatParticipant[];
  getState?: () => TState | null;
  onSpeech?: (text: string, speechAct?: string, targetId?: string) => Promise<any>;
  onToolCall?: (toolName: string, args: Record<string, any>, ctx?: ClientShellConfig) => Promise<any>;
  onCommand?: (command: string, args: string) => Promise<boolean | void>;
  redrawView?: () => void;
  logTurn?: (msg: string) => Promise<void>;
  hint?: string;
}

export type ShellContext<TAction = any> = ClientShellConfig<any, TAction>;
export type GroupChatContext = ClientShellConfig;

export const DEFAULT_CHAT_VERBS: ChatVerbDefinition[] = [
  {
    name: 'whisper',
    aliases: ['w'],
    description: 'Whisper privately to a participant',
    usage: '<name> <msg>',
    speechAct: 'WHISPER',
    directed: true,
  },
  {
    name: 'banter',
    aliases: ['b'],
    description: 'Banter or informal talk to the group',
    usage: '<msg>',
    speechAct: 'BANTER',
  },
];

