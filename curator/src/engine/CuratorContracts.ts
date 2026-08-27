import type { PrismaClient } from '@prisma/client';
import type { CuratorAstNode } from './CuratorAst.js';

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
  conversationId: string;
  userId: number;
  projectId?: number | null;
  content: string;
}

export interface CuratorToolResult {
  output: unknown;
  content?: string;
}

export interface CuratorModelResult {
  text: string;
  raw?: unknown;
  model?: string;
  provider?: string;
}

export interface CuratorScriptDefinition {
  run: (context: CuratorExecutionContext) => Promise<unknown>;
}

export interface CuratorAgentDefinition {
  description?: string;
  ast?: CuratorAstNode;
  sourceCode?: string;
}

export interface CuratorPluginDefinition {
  name: string;
  tools?: Record<string, import('../tools/CuratorTool.js').CuratorTool>;
  models?: import('../services/SemanticSchemaEngine.js').SemanticNodeShape[];
  scripts?: Record<string, CuratorScriptDefinition>;
  agents?: Record<string, CuratorAgentDefinition | CuratorAstNode>;
}

export interface CuratorDatabaseContext {
  prisma: PrismaClient;
}