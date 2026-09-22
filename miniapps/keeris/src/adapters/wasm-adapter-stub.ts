import type { CuratorClientAdapter } from './types.ts';

/**
 * Lightweight stub of WasmWorkerAdapter used during server-only builds.
 * Completely eliminates @sqlite.org/sqlite-wasm and db-worker from the bundle.
 */
export class WasmWorkerAdapter implements CuratorClientAdapter {
  readonly mode = 'wasm' as const;
  async init(): Promise<void> {}
  isReady(): boolean {
    return false;
  }
  async requestGraphql(): Promise<any> {
    throw new Error('WASM mode is disabled in server-only build');
  }
  async triggerAgent(): Promise<any> {
    throw new Error('WASM mode is disabled in server-only build');
  }
  async toggleAgent(): Promise<any> {
    throw new Error('WASM mode is disabled in server-only build');
  }
  async togglePause(): Promise<boolean> {
    return false;
  }
  async getProcessorState(): Promise<boolean> {
    return false;
  }
  async getStorageInfo() {
    return { usage: 0, quota: 0, storageEngine: 'server-stub', isOpfs: false };
  }
  onProgress(): () => void {
    return () => {};
  }
  onDatabaseChange(): () => void {
    return () => {};
  }
  notifyDatabaseChange(): void {}
  async exportDatabase(): Promise<boolean> {
    return false;
  }
  async importDatabase(): Promise<boolean> {
    return false;
  }
  async resetDatabase(): Promise<boolean> {
    return false;
  }
  async rehydrateSeed(): Promise<boolean> {
    return false;
  }
}
