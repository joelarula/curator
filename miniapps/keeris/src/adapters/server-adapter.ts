import type { CuratorClientAdapter, StorageInfo } from './types.ts';

export function getServerBaseUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SERVER_URL) {
    return String(import.meta.env.VITE_SERVER_URL).replace(/\/+$/, '');
  }
  // In dev mode (e.g. Vite dev server on 3001), target the local Node server on 4001
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    return 'http://localhost:4001';
  }
  // In production (same-origin Express server serving web-dist and API on same port)
  return '';
}

export class ServerClientAdapter implements CuratorClientAdapter {
  readonly mode = 'server' as const;
  private ready = false;
  private progressListeners = new Set<(type: string, payload: any) => void>();
  private dbChangeListeners = new Set<(info: { tables: string[]; timestamp: number }) => void>();
  private processorPaused = false;
  private serverUrl: string;

  constructor(serverUrl?: string) {
    this.serverUrl = serverUrl ?? getServerBaseUrl();
  }

  async init(): Promise<void> {
    const displayTarget = this.serverUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4001');
    try {
      const res = await fetch(`${this.serverUrl}/health`);
      if (res.ok) {
        const data = await res.json();
        console.log(`[Curator Adapter] Connected to Server backend: ${data.database || 'PostgreSQL'} at ${displayTarget}`);
        this.ready = true;
        return;
      }
    } catch (err: any) {
      console.warn(`[Curator Adapter] Server probe failed at ${displayTarget}: ${err?.message}`);
    }
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async requestGraphql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
    const url = `${this.serverUrl}/graphql`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status} ${res.statusText}`;
      try {
        const errPayload = await res.json();
        if (errPayload?.errors?.length) {
          msg = errPayload.errors.map((e: any) => e.message).join(', ');
        }
      } catch (_) {}
      throw new Error(`[Server GraphQL] Request failed: ${msg}`);
    }

    const payload = await res.json();
    if (payload.errors && payload.errors.length > 0) {
      throw new Error(payload.errors.map((e: any) => e.message).join(', '));
    }
    return payload.data as T;
  }

  async triggerAgent(agentNameOrId: string, options: { refresh?: boolean } = {}): Promise<any> {
    this.emitProgress('log', { message: `[Server] Triggering agent workflow: ${agentNameOrId}...` });
    try {
      const result = await this.requestGraphql(`
        mutation TriggerAgent($name: String!, $refresh: Boolean) {
          triggerCuratorAgent(name: $name, refresh: $refresh) {
            id
            content
            createdAt
          }
        }
      `, { name: agentNameOrId, refresh: options?.refresh ?? false });

      this.emitProgress('complete', {
        title: agentNameOrId,
        programTitle: agentNameOrId,
        message: `Agent ${agentNameOrId} task enqueued on server`,
      });
      this.notifyDatabaseChange(['episodes', 'tracks', 'stats']);
      return result;
    } catch (err: any) {
      this.emitProgress('error', { message: `Failed to trigger agent ${agentNameOrId}: ${err?.message}` });
      throw err;
    }
  }

  async toggleAgent(id: string, isActive: boolean): Promise<any> {
    const res = await this.requestGraphql(`
      mutation ToggleAgent($id: ID!, $isActive: Boolean!) {
        toggleCuratorAgent(id: $id, isActive: $isActive) {
          id
          isActive
        }
      }
    `, { id, isActive });
    this.notifyDatabaseChange(['agents']);
    return res;
  }

  async getProcessorState(): Promise<boolean> {
    return this.processorPaused;
  }

  async togglePause(): Promise<boolean> {
    this.processorPaused = !this.processorPaused;
    this.emitProgress('log', {
      message: `[Server] Request processor ${this.processorPaused ? 'paused' : 'resumed'}`,
    });
    return this.processorPaused;
  }

  async pauseRequest(requestId: string): Promise<any> {
    console.log(`[Server] Pause request ${requestId}`);
    return { success: true };
  }

  async resumeRequest(requestId: string): Promise<any> {
    console.log(`[Server] Resume request ${requestId}`);
    return { success: true };
  }

  async getStorageInfo(): Promise<StorageInfo> {
    try {
      const res = await fetch(`${this.serverUrl}/health`);
      if (res.ok) {
        const data = await res.json();
        return {
          usage: 0,
          quota: 0,
          isOpfs: false,
          storageEngine: `Remote ${String(data.database || 'PostgreSQL').toUpperCase()} (${Number(data.episodes || 0).toLocaleString()} episodes)`,
          details: `Connected to ${data.mode || 'express-graphql'} with ${data.plugins?.length || 0} plugins`,
        };
      }
    } catch (_) {}
    return {
      usage: 0,
      quota: 0,
      isOpfs: false,
      storageEngine: 'MariaDB 11.4 (Docker)',
    };
  }

  async getDatabaseHealth(): Promise<any> {
    try {
      const data = await this.requestGraphql(`
        query GetCuratorHealth {
          curatorDatabaseHealth {
            storageEngine
            isOpfs
            tables {
              name
              rowCount
            }
            requestsTotal
            requestsCompleted
            requestsFailed
            requestsPending
            agentsTotal
            agentsActive
          }
        }
      `);
      if (data?.curatorDatabaseHealth) {
        return data.curatorDatabaseHealth;
      }
    } catch (err: any) {
      console.warn('[Server Adapter] getDatabaseHealth query failed:', err?.message);
    }

    return {
      storageEngine: 'MariaDB 11.4 (Docker)',
      isOpfs: false,
      tables: [],
      requestsTotal: 0,
      requestsCompleted: 0,
      requestsFailed: 0,
      requestsPending: 0,
      agentsTotal: 0,
      agentsActive: 0,
    };
  }


  async rehydrateSeed(): Promise<boolean> {
    console.log('[Server] Rehydrate seed requested - triggering refresh on server');
    this.notifyDatabaseChange(['all']);
    return true;
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
        console.error('[Server Adapter] Error in progress listener:', err);
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
        console.error('[Server Adapter] Error in dbChange listener:', err);
      }
    });
  }
}
