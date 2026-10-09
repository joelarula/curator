import type { CuratorConsoleAdapter, CuratorDatabaseHealth } from '@curator/console';

export class BlueprintCuratorAdapter implements CuratorConsoleAdapter {
  private progressListeners: Set<(type: string, payload: any) => void> = new Set();
  private dbChangeListeners: Set<(info: { tables: string[]; timestamp: number }) => void> = new Set();
  private ws: WebSocket | null = null;

  constructor() {
    this.initWebSocket();
  }

  private initWebSocket() {
    if (typeof window === 'undefined') return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/events`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.progressListeners.forEach((cb) => cb(data.type || 'event', data.payload || data));
          if (data.type?.includes('db:') || data.type?.includes('request:') || data.type?.includes('agent:')) {
            this.dbChangeListeners.forEach((cb) =>
              cb({ tables: ['requests', 'responses', 'agents'], timestamp: Date.now() })
            );
          }
        } catch (_) {}
      };
      this.ws.onclose = () => {
        setTimeout(() => this.initWebSocket(), 3000);
      };
    } catch (_) {}
  }

  async requestGraphql(query: string, variables?: any): Promise<any> {
    const res = await fetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      throw new Error(`GraphQL request failed: ${res.statusText}`);
    }
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(json.errors[0].message);
    }
    return json.data;
  }

  async togglePause(): Promise<boolean> {
    const res = await fetch('/api/curator/engine/toggle-pause', { method: 'POST' });
    const json = await res.json();
    return json.isPaused;
  }

  async getProcessorState(): Promise<boolean> {
    const res = await fetch('/api/curator/engine/status');
    const json = await res.json();
    return json.isPaused;
  }

  async pauseRequest(requestId: string): Promise<any> {
    const res = await fetch(`/api/curator/requests/${requestId}/pause`, { method: 'POST' });
    return res.json();
  }

  async resumeRequest(requestId: string): Promise<any> {
    const res = await fetch(`/api/curator/requests/${requestId}/resume`, { method: 'POST' });
    return res.json();
  }

  async exportDatabase(): Promise<boolean> {
    window.open('/api/curator/db/export', '_blank');
    return true;
  }

  async importDatabase(file: File): Promise<boolean> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/curator/db/import', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Database import failed');
    return true;
  }

  async resetDatabase(): Promise<boolean> {
    const res = await fetch('/api/curator/db/reset', { method: 'POST' });
    if (!res.ok) throw new Error('Database reset failed');
    return true;
  }

  async getStorageInfo(): Promise<{ usage: number; quota: number; storageEngine: string; isOpfs: boolean }> {
    return {
      usage: 1024 * 512,
      quota: 1024 * 1024 * 100,
      storageEngine: 'SQLite (Server Host File)',
      isOpfs: false,
    };
  }

  async getDatabaseHealth(): Promise<CuratorDatabaseHealth> {
    const res = await fetch('/api/curator/db/health');
    return res.json();
  }

  async triggerAgent(agentId: string, options?: any): Promise<any> {
    const res = await fetch('/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentId, context: options || {} }),
    });
    return res.json();
  }

  async toggleAgent(agentId: string, isActive: boolean): Promise<any> {
    const res = await fetch('/api/curator/agents/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, isActive }),
    });
    return res.json();
  }

  onProgress(callback: (type: string, payload: any) => void): () => void {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  onDatabaseChange(callback: (info: { tables: string[]; timestamp: number }) => void): () => void {
    this.dbChangeListeners.add(callback);
    return () => this.dbChangeListeners.delete(callback);
  }
}

export const blueprintCuratorAdapter = new BlueprintCuratorAdapter();
