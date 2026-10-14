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
}

export interface CuratorHostRbacConfig {
  managers?: string[];
}

export interface CuratorHostConfig {
  name: string;
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
  start(intervalMs?: number): Promise<void>;
  stop(): Promise<void>;
  gracefulShutdown(): Promise<void>;
  seed(): Promise<SeedResult>;
  triggerAgent(name: string, context?: Record<string, any>): Promise<any>;
  pauseRequest(requestId: number | string): Promise<any>;
  resumeRequest(requestId: number | string): Promise<any>;
}
