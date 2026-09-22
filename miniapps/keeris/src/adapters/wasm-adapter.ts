import type { CuratorClientAdapter, StorageInfo } from './types.ts';

export class WasmWorkerAdapter implements CuratorClientAdapter {
  readonly mode = 'wasm' as const;
  private worker: Worker | null = null;
  private ready = false;
  private pendingRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private progressListeners = new Set<(type: string, payload: any) => void>();
  private dbChangeListeners = new Set<(info: { tables: string[]; timestamp: number }) => void>();
  private readyCallbacks: Array<() => void> = [];
  private requestIdCounter = 0;

  private nextRequestId(): string {
    return String(++this.requestIdCounter);
  }

  private getWorker(): Worker {
    if (!this.worker) {
      console.log('[Wasm Adapter] Initializing in-browser SQLite WASM Web Worker...');
      // URL relative to worker location
      this.worker = new Worker(new URL('../../wasm/db-worker.ts', import.meta.url), { type: 'module' });

      this.worker.onerror = (event: ErrorEvent) => {
        console.error('[Wasm Adapter] Uncaught worker error:', event.message, event);
        this.emitProgress('error', '[Worker] Uncaught error: ' + event.message);
      };

      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then((granted) => {
          console.log('[Wasm Adapter] Persistent OPFS storage: ' + (granted ? 'Granted' : 'Default'));
        });
      }

      this.worker.onmessage = (event: MessageEvent) => {
        const { id, type, data, errors, payload, eventType, success, isPaused } = event.data || {};
        console.log(
          `%c[Worker RX ⬅] %c${type || 'MESSAGE'}`,
          'color: #34d399; font-weight: bold;',
          'color: #cbd5e1;',
          event.data
        );
        this.emitProgress('postmessage_rx', event.data);

        if (type === 'READY') {
          console.log('[Wasm Adapter] OPFS SQLite DB & Curator Engine Ready!');
          this.ready = true;
          this.readyCallbacks.forEach((fn) => fn());
          this.readyCallbacks.length = 0;
        }

        if (type === 'ERROR') {
          console.error('[Wasm Adapter] Worker reported fatal error:', payload?.message);
          this.emitProgress('error', '[Worker] ' + (payload?.message || 'Unknown worker error'));
          for (const [, { reject }] of this.pendingRequests) {
            reject(new Error(payload?.message || 'Worker initialization failed'));
          }
          this.pendingRequests.clear();
        }

        if (type === 'AGENT_PROGRESS') {
          this.emitProgress(eventType, payload);
          if (
            eventType === 'episode' ||
            eventType === 'done' ||
            eventType === 'complete' ||
            eventType === 'request_done'
          ) {
            this.notifyDatabaseChange(['episodes', 'tracks', 'stats']);
          }
        }

        if (type === 'DATABASE_CHANGED') {
          this.notifyDatabaseChange(event.data?.tables || payload?.tables || ['all']);
        }

        if (id && this.pendingRequests.has(id)) {
          const { resolve, reject } = this.pendingRequests.get(id)!;
          this.pendingRequests.delete(id);
          if (errors && errors.length > 0) {
            reject(new Error(errors.map((e: any) => e.message).join(', ')));
          } else {
            const resVal = isPaused !== undefined ? isPaused : data ?? payload ?? success;
            resolve(resVal);
          }
        }
      };
    }
    return this.worker;
  }

  private sendWorkerMessage(message: Record<string, any>, transferList?: Transferable[]): void {
    const w = this.getWorker();
    console.log(
      `%c[Worker TX ➔] %c${message.type || 'MESSAGE'}`,
      'color: #38bdf8; font-weight: bold;',
      'color: #cbd5e1;',
      message
    );
    this.emitProgress('postmessage_tx', message);
    if (transferList) {
      w.postMessage(message, transferList);
    } else {
      w.postMessage(message);
    }
  }

  async init(): Promise<void> {
    if (this.ready) return;
    return new Promise((resolve) => {
      this.readyCallbacks.push(resolve);
      this.getWorker();
    });
  }

  isReady(): boolean {
    return this.ready;
  }

  requestGraphql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId();
      const timeoutMs = 45000;
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`GraphQL request timed out after ${timeoutMs / 1000}s (worker may be busy)`));
        }
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.sendWorkerMessage({ id, type: 'GRAPHQL_REQUEST', query, variables });
    });
  }

  triggerAgent(agentNameOrId: string, options: { refresh?: boolean } = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId();
      this.pendingRequests.set(id, { resolve, reject });
      this.sendWorkerMessage({
        id,
        type: 'ENQUEUE_AGENT',
        agentName: agentNameOrId,
        refresh: options?.refresh ?? false,
      });
    });
  }

  async toggleAgent(id: string, isActive: boolean): Promise<any> {
    return this.requestGraphql(`
      mutation ToggleAgent($id: ID!, $isActive: Boolean!) {
        toggleCuratorAgent(id: $id, isActive: $isActive) {
          id
          isActive
        }
      }
    `, { id, isActive });
  }

  getProcessorState(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId();
      this.pendingRequests.set(id, { resolve, reject });
      this.sendWorkerMessage({ id, type: 'GET_PROCESSOR_STATE' });
    });
  }

  togglePause(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId();
      this.pendingRequests.set(id, { resolve, reject });
      this.sendWorkerMessage({ id, type: 'TOGGLE_PAUSE_PROCESSOR' });
    });
  }

  pauseRequest(requestId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId();
      this.pendingRequests.set(id, { resolve, reject });
      this.sendWorkerMessage({ id, type: 'PAUSE_REQUEST', requestId });
    });
  }

  resumeRequest(requestId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId();
      this.pendingRequests.set(id, { resolve, reject });
      this.sendWorkerMessage({ id, type: 'RESUME_REQUEST', requestId });
    });
  }

  async getStorageInfo(): Promise<StorageInfo> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return {
        usage: est.usage || 0,
        quota: est.quota || 0,
        isOpfs: true,
        storageEngine: 'OPFS SQLite3 (In-Browser)',
      };
    }
    return {
      usage: 0,
      quota: 0,
      isOpfs: true,
      storageEngine: 'OPFS SQLite3 (In-Browser)',
    };
  }

  async exportDatabase(): Promise<boolean> {
    const id = this.nextRequestId();
    const arrayBuffer = (await new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.sendWorkerMessage({ id, type: 'EXPORT_DATABASE' });
    })) as ArrayBuffer;

    const blob = new Blob([arrayBuffer], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `keeris-backup-${dateStr}.sqlite3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  async importDatabase(file: File): Promise<boolean> {
    const arrayBuffer = await file.arrayBuffer();
    const id = this.nextRequestId();
    await new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.sendWorkerMessage({ id, type: 'IMPORT_DATABASE', payload: { arrayBuffer } }, [arrayBuffer]);
    });
    return true;
  }

  resetDatabase(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId();
      this.pendingRequests.set(id, { resolve, reject });
      this.sendWorkerMessage({ id, type: 'RESET_DATABASE' });
    });
  }

  rehydrateSeed(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId();
      this.pendingRequests.set(id, { resolve, reject });
      this.sendWorkerMessage({ id, type: 'REHYDRATE_SEED' });
    });
  }

  onProgress(callback: (type: string, payload: any) => void): () => void {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  private emitProgress(type: string, payload: any): void {
    this.progressListeners.forEach((fn) => {
      try {
        fn(type, payload);
      } catch (err) {
        console.error('[Wasm Adapter] Error in progress listener:', err);
      }
    });
  }

  onDatabaseChange(callback: (info: { tables: string[]; timestamp: number }) => void): () => void {
    this.dbChangeListeners.add(callback);
    return () => this.dbChangeListeners.delete(callback);
  }

  notifyDatabaseChange(tables: string | string[] = []): void {
    const payload = { tables: Array.isArray(tables) ? tables : [tables], timestamp: Date.now() };
    this.dbChangeListeners.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error('[Wasm Adapter] Error in dbChange listener:', err);
      }
    });
  }
}
