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

export interface CuratorPluginDefinition {
  name: string;
  tools?: Record<string, CuratorTool>;
  models?: SemanticNodeShape[];
  scripts?: Record<string, CuratorScriptDefinition>;
  agents?: Record<string, CuratorAgentDefinition | CuratorAstNode>;
}

export interface CuratorDatabaseContext {
  prisma: PrismaClient;
}