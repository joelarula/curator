import type { ProgressCallback } from './types.ts';
import {
  getCuratorAdapter,
  getActiveAdapterSync,
  getServerBaseUrl,
  type CuratorClientAdapter,
  type AppMode,
} from '../src/adapters/index.ts';

export { getServerBaseUrl, getCuratorAdapter, getActiveAdapterSync };
export type { CuratorClientAdapter, AppMode };

/**
 * Execute a GraphQL query or mutation against the active engine adapter
 * (Node Express GraphQL endpoint in Server mode, or in-worker SQLite schema in WASM mode).
 */
export async function requestGraphql(query: string, variables: Record<string, any> = {}): Promise<any> {
  const adapter = await getCuratorAdapter();
  return adapter.requestGraphql(query, variables);
}

/**
 * Wait until the active Curator engine is ready to accept requests.
 * In Server mode, fires immediately once /health is verified.
 * In WASM mode, fires once OPFS SQLite schema initialization completes.
 */
export async function onWorkerReady(callback: () => void): Promise<void> {
  const adapter = await getCuratorAdapter();
  if (adapter.isReady()) {
    callback();
  } else {
    await adapter.init();
    callback();
  }
}

/** Modern alias for onWorkerReady */
export const onEngineReady = onWorkerReady;

/**
 * Enqueue or trigger a Curator Agent scrape task.
 * In Server mode, dispatches the triggerCuratorAgent mutation to Node Express.
 * In WASM mode, posts ENQUEUE_AGENT message to the Web Worker.
 */
export async function enqueueAgent(agentName: string, options: { refresh?: boolean } = {}): Promise<any> {
  const adapter = await getCuratorAdapter();
  return adapter.triggerAgent(agentName, options);
}

/** Toggle pause/resume state on the active Curator RequestProcessor. */
export async function toggleProcessorPause(): Promise<boolean> {
  const adapter = await getCuratorAdapter();
  return adapter.togglePause();
}

/** Modern alias for toggleProcessorPause */
export const toggleEnginepause = toggleProcessorPause;

/** Get current pause state of the Curator RequestProcessor. */
export async function getProcessorState(): Promise<boolean> {
  const adapter = await getCuratorAdapter();
  return adapter.getProcessorState();
}

/** Modern alias for getProcessorState */
export const getEngineState = getProcessorState;

/** Pause an individual Curator Request by ID */
export async function pauseRequest(requestId: string): Promise<any> {
  const adapter = await getCuratorAdapter();
  return adapter.pauseRequest?.(requestId);
}

/** Resume an individual paused Curator Request by ID */
export async function resumeRequest(requestId: string): Promise<any> {
  const adapter = await getCuratorAdapter();
  return adapter.resumeRequest?.(requestId);
}

/** Subscribe to agent progress / log events emitted by the active Curator Engine. */
export function onAgentProgress(callback: ProgressCallback): () => void {
  let unsub: (() => void) | null = null;
  getCuratorAdapter().then((adapter) => {
    unsub = adapter.onProgress(callback);
  });
  return () => {
    if (unsub) unsub();
  };
}

/**
 * Subscribe to real-time database invalidation events pushed from the active engine.
 */
export function onDatabaseChange(callback: (payload: { tables: string[]; timestamp: number }) => void): () => void {
  let unsub: (() => void) | null = null;
  getCuratorAdapter().then((adapter) => {
    unsub = adapter.onDatabaseChange(callback);
  });
  return () => {
    if (unsub) unsub();
  };
}

/**
 * Dispatch database invalidation to all subscribed Vue views.
 */
export async function notifyDatabaseChange(tables: string | string[] = []): Promise<void> {
  const adapter = await getCuratorAdapter();
  adapter.notifyDatabaseChange(tables);
}

/** Download the OPFS SQLite database as a .sqlite3 file (WASM mode only). */
export async function exportDatabase(): Promise<boolean | ArrayBuffer> {
  const adapter = await getCuratorAdapter();
  return adapter.exportDatabase?.() ?? false;
}

/** Import a user-selected .sqlite file directly into OPFS (WASM mode only). */
export async function importDatabase(file: File): Promise<boolean> {
  const adapter = await getCuratorAdapter();
  return adapter.importDatabase?.(file) ?? false;
}

/** Delete the local OPFS database file entirely (WASM mode only). */
export async function resetDatabase(): Promise<boolean> {
  const adapter = await getCuratorAdapter();
  return adapter.resetDatabase?.() ?? false;
}

/** Rehydrate seed data into the database. */
export async function rehydrateSeed(): Promise<boolean> {
  const adapter = await getCuratorAdapter();
  return adapter.rehydrateSeed?.() ?? true;
}

/** Get the currently active mode ('server' or 'wasm') */
export async function getAppMode(): Promise<AppMode> {
  const adapter = await getCuratorAdapter();
  return adapter.mode;
}
