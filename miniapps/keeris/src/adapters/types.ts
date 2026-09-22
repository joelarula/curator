import type { CuratorConsoleAdapter } from '@curator/console';

export type AppMode = 'server' | 'wasm';

export interface StorageInfo {
  usage: number;
  quota: number;
  storageEngine?: string;
  isOpfs?: boolean;
  details?: string;
}

/**
 * Universal client adapter interface for the Keeris MiniApp.
 * Decouples Vue UI components from the underlying execution runtime
 * (Node Express + PostgreSQL server vs. in-browser OPFS SQLite WASM Worker).
 */
export interface CuratorClientAdapter extends CuratorConsoleAdapter {
  readonly mode: AppMode;

  /** Initialize adapter, determine ready state, and establish connections */
  init(): Promise<void>;

  /** Whether the adapter is ready to accept requests */
  isReady(): boolean;

  /** Execute a GraphQL query or mutation */
  requestGraphql<T = any>(query: string, variables?: Record<string, any>): Promise<T>;

  /** Trigger an agent workflow (by agent name or ID) */
  triggerAgent(agentNameOrId: string, options?: { refresh?: boolean }): Promise<any>;

  /** Toggle active schedule state of an agent */
  toggleAgent(id: string, isActive: boolean): Promise<any>;

  /** Get the pause state of the request processor */
  getProcessorState(): Promise<boolean>;

  /** Toggle the pause state of the request processor */
  togglePause(): Promise<boolean>;

  /** Get storage and database engine diagnostics */
  getStorageInfo(): Promise<StorageInfo>;

  /** Export database file (OPFS backup or server dump) */
  exportDatabase?(): Promise<boolean | ArrayBuffer>;

  /** Import database file into local OPFS or server */
  importDatabase?(file: File): Promise<boolean>;

  /** Reset local database storage */
  resetDatabase?(): Promise<boolean>;

  /** Rehydrate seed data into the database */
  rehydrateSeed?(): Promise<boolean>;

  /** Subscribe to agent progress / log events */
  onProgress(callback: (type: string, payload: any) => void): () => void;

  /** Subscribe to database table mutation notifications */
  onDatabaseChange(callback: (info: { tables: string[]; timestamp: number }) => void): () => void;

  /** Manually trigger database table invalidation event */
  notifyDatabaseChange(tables: string | string[]): void;
}
