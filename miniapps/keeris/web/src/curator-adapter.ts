import type { CuratorConsoleAdapter } from '@curator/console';
import {
  requestGraphql,
  onAgentProgress,
  toggleProcessorPause,
  getProcessorState,
  pauseRequest,
  resumeRequest,
  exportDatabase,
  importDatabase,
  resetDatabase,
  enqueueAgent,
  onDatabaseChange,
} from '@wasm/graphql-client';

/**
 * Implements CuratorConsoleAdapter for the Keeris MiniApp WASM environment.
 * Type-checked against the canonical CuratorConsoleAdapter interface from @curator/console.
 */
export const keerisCuratorAdapter: CuratorConsoleAdapter = {
  requestGraphql(query: string, variables?: any) {
    return requestGraphql(query, variables);
  },
  onProgress(callback: (type: string, payload: any) => void) {
    return onAgentProgress(callback);
  },
  onDatabaseChange(callback: (info: { tables: string[]; timestamp: number }) => void) {
    return onDatabaseChange(callback);
  },
  togglePause() {
    return toggleProcessorPause();
  },
  getProcessorState() {
    return getProcessorState();
  },
  pauseRequest(requestId: string) {
    return pauseRequest(requestId);
  },
  resumeRequest(requestId: string) {
    return resumeRequest(requestId);
  },
  exportDatabase() {
    return exportDatabase();
  },
  importDatabase(file: File) {
    return importDatabase(file);
  },
  resetDatabase() {
    return resetDatabase();
  },
  triggerAgent(agentId: string, options?: any) {
    return enqueueAgent(agentId, options);
  },
  async getStorageInfo() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return { usage: est.usage || 0, quota: est.quota || 0, isOpfs: true, storageEngine: 'OPFS SQLite3' };
    }
    return { usage: 0, quota: 0, isOpfs: true, storageEngine: 'OPFS SQLite3' };
  },
};
