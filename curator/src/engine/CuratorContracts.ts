import type { PrismaClient } from '@prisma/client';
import type { CuratorAstNode } from './CuratorAst.js';
import type { CuratorTool } from '../tools/CuratorTool.js';
import type { SemanticNodeShape } from '../services/SemanticSchemaEngine.js';

export type JsonRecord = Record<string, unknown>;

export interface CuratorExecutionContext {
  input?: unknown;
  state?: JsonRecord;
  [key: string]: unknown;
}

export interface CuratorRequestRecord {
  id: number;
  userId: number;
  projectId?: number | null;
  conversationId: string;
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
  userId: number;
  projectId?: number | null;
  conversationId: string;
  ast?: unknown;
  context?: CuratorExecutionContext | null;
  content?: string | null;
  state?: JsonRecord | null;
  durationMs?: number | null;
  cost?: number | null;
  status: string;
  errorMessage?: string | null;
  retryCount: number;
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

export interface CuratorAgentDefinition {
  description?: string;
  ast?: CuratorAstNode;
  sourceCode?: string;
  schedule?: string;
  enabled?: boolean;
  toolName?: string;
  args?: Record<string, unknown>;
}

export interface CuratorPluginMcpPolicy {
  /** Expose all tools from this plugin on MCP (overrides per-tool default) */
  exposeAll?: boolean;
  /** Only expose these tool keys */
  include?: string[];
  /** Never expose these tool keys */
  exclude?: string[];
}

export interface CuratorPluginDefinition {
  name: string;
  version?: string;
  description?: string;
  tools?: Record<string, CuratorTool>;
  models?: SemanticNodeShape[];
  scripts?: Record<string, CuratorScriptDefinition>;
  agents?: Record<string, CuratorAgentDefinition | CuratorAstNode>;
  llmProviders?: Record<string, any>;
  mcp?: CuratorPluginMcpPolicy;
  onInit?: (context: any) => Promise<void> | void;
  onDestroy?: () => Promise<void> | void;
}

export interface CuratorDatabaseContext {
  prisma?: PrismaClient;
}