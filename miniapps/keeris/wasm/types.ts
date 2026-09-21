/**
 * wasm/types.ts
 * Types for the WASM Curator Engine and In-Worker Architecture.
 * Reuses and imports canonical types from Curator core modules:
 * - @curator/ast (server/src/services/ast/types.ts)
 * - @curator/console (packages/curator-console/src/types.ts)
 * - @curator/wasm-core (server/src/wasm-core/types.ts)
 */

// ─── Import & Re-export from Curator Core AST ────────────────────────────────
export type {
  ASTNode,
  SequenceNode,
  ToolNode as ToolTaskNode,
  ForEachNode,
  IfNode as IfElseNode,
  ParallelNode,
  WhileNode,
  SpawnNode,
  BaseNode,
} from '@curator/ast';

import type { ASTNode } from '@curator/ast';

// Canonical ASTNode alias for backwards compatibility
export type AstNode = ASTNode;

// ─── Import & Re-export from Curator Console ────────────────────────────────
export type {
  CuratorConsoleAdapter,
  CuratorDatabaseHealth,
  CuratorTableInfo,
  CuratorLogEntry,
  CuratorAgentSummary,
  CuratorRequestSummary,
} from '@curator/console';

// ─── Import & Re-export from Curator WASM Core ──────────────────────────────
export type {
  ISqliteDatabase,
  ISqliteStatement,
  ICuratorCoreConfig,
  IGraphqlRequest,
  IGraphqlResult,
} from '@curator/wasm-core';

import type { ISqliteDatabase } from '@curator/wasm-core';

// ─── Execution Context & Checkpoint ─────────────────────────────────────────
export interface ExecutionContext extends Record<string, any> {
  __pausedStepIndex__?: number;
  __pausedIterIndex__?: number;
  __paused__?: boolean;
}

// ─── Tool Registry & Handlers ───────────────────────────────────────────────
export type ProgressCallback = (eventType: string, payload: any) => void;

export interface ToolExecutionParams<TArgs = any> {
  args: TArgs;
  env?: ExecutionContext;
  db?: OpfsDatabase;
  onProgress?: ProgressCallback | null;
  isPaused?: () => boolean;
  checkPause?: () => Promise<void>;
}

export type WasmToolHandler<TArgs = any, TResult = any> = (
  params: ToolExecutionParams<TArgs>
) => Promise<TResult>;

// ─── Program Manifest & Agents ──────────────────────────────────────────────
export interface ProgramManifestEntry {
  seriesContentId: string;
  programTitle: string;
  schedule?: string;
  enabled?: boolean;
  ast?: AstNode;
}

export type ProgramManifest = Record<string, ProgramManifestEntry>;

export interface WasmAgentDefinition extends ProgramManifestEntry {}

// ─── WASM Plugin Interface ─────────────────────────────────────────────────
export interface WasmPlugin {
  name: string;
  tools?: Record<string, WasmToolHandler>;
  agents?: Record<string, ProgramManifestEntry>;
}

// ─── SQLite WASM & OPFS Interfaces ──────────────────────────────────────────
export interface Sqlite3Instance {
  version: {
    libVersion: string;
  };
  oo1: {
    OpfsDb: new (path: string) => OpfsDatabase;
    DB: new (path?: string, mode?: string) => OpfsDatabase;
  };
  opfs?: any;
}

/**
 * Universal OPFS Database interface, extending Curator's ISqliteDatabase
 */
export interface OpfsDatabase extends ISqliteDatabase {
  exec: (
    sql: string | { sql: string; bind?: any[]; callback?: (row: any[]) => void; rowMode?: 'array' | 'object'; resultRows?: any[] },
    bind?: any[]
  ) => any;
  close: () => void;
  isOpen?: () => boolean;
  changes?: () => number;
}

// ─── Worker Communication Types ─────────────────────────────────────────────
export type WorkerInboundAction =
  | 'INIT'
  | 'GRAPHQL'
  | 'TRIGGER_AGENT'
  | 'TOGGLE_PAUSE'
  | 'GET_PROCESSOR_STATE'
  | 'PAUSE_REQUEST'
  | 'RESUME_REQUEST'
  | 'EXPORT_DB'
  | 'IMPORT_DB'
  | 'RESET_DB';

export interface WorkerInboundMessage {
  id?: string;
  type: WorkerInboundAction;
  query?: string;
  variables?: Record<string, any>;
  agentId?: string;
  options?: Record<string, any>;
  requestId?: string;
  buffer?: ArrayBuffer;
}

export type WorkerOutboundAction =
  | 'READY'
  | 'GRAPHQL_RESPONSE'
  | 'AGENT_PROGRESS'
  | 'DATABASE_CHANGED'
  | 'PROCESSOR_PAUSED'
  | 'PROCESSOR_STATE'
  | 'DB_EXPORTED'
  | 'DB_IMPORTED'
  | 'DB_RESET'
  | 'ERROR';

export interface WorkerOutboundMessage {
  id?: string;
  type: WorkerOutboundAction;
  data?: any;
  errors?: any[];
  eventType?: string;
  payload?: any;
  tables?: string[];
  timestamp?: number;
  isPaused?: boolean;
  buffer?: ArrayBuffer;
  error?: string;
}

// ─── Domain & GraphQL Models (canonical source of truth: src/types.ts) ───────
export type {
  Track,
  Episode,
  Program,
  EpisodeMetadata,
  UniqueTrack,
  ProgramStat,
  ProgramStat as ProgramBreakdown,
  Stats,
  PlaylistItem,
  Playlist,
  CuratorAgent,
  CuratorRequest,
  CuratorResponse,
} from '../src/types';

// Backwards-compatible aliases
export type { Episode as EpisodeGql, Track as EpisodeTrackGql } from '../src/types';

