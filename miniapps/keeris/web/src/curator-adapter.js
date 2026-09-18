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
} from '@wasm/graphql-client.js';

/**
 * Implements CuratorConsoleAdapter for the Keeris MiniApp WASM environment.
 */
export const keerisCuratorAdapter = {
  requestGraphql(query, variables) {
    return requestGraphql(query, variables);
  },
  onProgress(callback) {
    return onAgentProgress(callback);
  },
  onDatabaseChange(callback) {
    return onDatabaseChange(callback);
  },
  togglePause() {
    return toggleProcessorPause();
  },
  getProcessorState() {
    return getProcessorState();
  },
  pauseRequest(requestId) {
    return pauseRequest(requestId);
  },
  resumeRequest(requestId) {
    return resumeRequest(requestId);
  },
  exportDatabase() {
    return exportDatabase();
  },
  importDatabase(file) {
    return importDatabase(file);
  },
  resetDatabase() {
    return resetDatabase();
  },
  triggerAgent(agentId, options) {
    return enqueueAgent(agentId, options);
  },
  async getStorageInfo() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return { usage: est.usage || 0, quota: est.quota || 0 };
    }
    return { usage: 0, quota: 0 };
  },
};
