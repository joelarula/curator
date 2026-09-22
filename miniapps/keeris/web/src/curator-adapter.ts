import type { CuratorConsoleAdapter } from '@curator/console';
import {
  getCuratorAdapter,
  getActiveAdapterSync,
  requestGraphql,
  onAgentProgress,
  toggleProcessorPause,
  getProcessorState,
  pauseRequest,
  resumeRequest,
  enqueueAgent,
  onDatabaseChange,
} from '@wasm/graphql-client';

const baseAdapter: CuratorConsoleAdapter = {
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
  triggerAgent(agentId: string, options?: any) {
    return enqueueAgent(agentId, options);
  },
  async getStorageInfo() {
    const adapter = await getCuratorAdapter();
    return adapter.getStorageInfo();
  },
};

/**
 * Universal adapter for CuratorConsole.
 * Uses a Proxy so database lifecycle methods (exportDatabase, importDatabase, resetDatabase)
 * only exist on the adapter when running in WASM mode, dynamically hiding those toolbar
 * buttons in Node Express Server mode.
 */
export const keerisCuratorAdapter: CuratorConsoleAdapter = new Proxy(baseAdapter, {
  get(target, prop: string | symbol) {
    if (prop in target) {
      return (target as any)[prop];
    }
    const active = getActiveAdapterSync();
    if (active && prop in active) {
      const val = (active as any)[prop];
      if (typeof val === 'function') {
        return val.bind(active);
      }
      return val;
    }
    return undefined;
  },
  has(target, prop: string | symbol) {
    if (prop in target) return true;
    const active = getActiveAdapterSync();
    if (active && prop in active) return true;
    return false;
  },
});
