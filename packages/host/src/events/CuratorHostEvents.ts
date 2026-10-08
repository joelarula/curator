import { EventEmitter } from 'node:events';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

export type CuratorEventType =
  | 'request_start'
  | 'request_done'
  | 'request_failed'
  | 'request_paused'
  | 'request_resumed'
  | 'database_change'
  | 'log'
  | 'error'
  | 'connected'
  | (string & {});

export interface CuratorEvent<T = any> {
  type: CuratorEventType;
  payload: T;
  timestamp: number;
}

export interface CuratorLogEntry {
  type: 'info' | 'error' | 'warn';
  message: string;
  time: string;
}

export class CuratorHostEvents extends EventEmitter {
  private recentLogs: CuratorLogEntry[] = [];
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;
  private maxLogs: number = 200;

  constructor(options?: { maxLogs?: number }) {
    super();
    if (options?.maxLogs) {
      this.maxLogs = options.maxLogs;
    }
  }

  public broadcast(type: CuratorEventType, payload: any): void {
    const time = new Date().toLocaleTimeString();

    if (type === 'log') {
      this.recentLogs.push({
        type: 'info',
        message: payload?.message || String(payload),
        time,
      });
      if (this.recentLogs.length > this.maxLogs) this.recentLogs.shift();
    } else if (type === 'error') {
      this.recentLogs.push({
        type: 'error',
        message: payload?.message || String(payload),
        time,
      });
      if (this.recentLogs.length > this.maxLogs) this.recentLogs.shift();
    }

    const event: CuratorEvent = {
      type,
      payload,
      timestamp: Date.now(),
    };

    // Emit typed event, wildcard event, and generic 'event'
    this.emit(type, payload, event);
    this.emit('*', event);
    this.emit('event', event);

    // Broadcast to WebSocket clients
    if (this.clients.size > 0) {
      const message = JSON.stringify(event);
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(message);
          } catch (_) {}
        }
      }
    }
  }

  public onEvent(callback: (event: CuratorEvent) => void): () => void {
    const handler = (event: CuratorEvent) => callback(event);
    this.on('event', handler);
    return () => this.off('event', handler);
  }

  public onType(type: CuratorEventType, callback: (payload: any, event: CuratorEvent) => void): () => void {
    const handler = (payload: any, event: CuratorEvent) => callback(payload, event);
    this.on(type, handler);
    return () => this.off(type, handler);
  }

  public getRecentLogs(): CuratorLogEntry[] {
    return [...this.recentLogs];
  }

  public attachWebSocketServer(server: HttpServer, wsPath: string = '/api/curator/ws'): WebSocketServer {
    if (this.wss) return this.wss;

    this.wss = new WebSocketServer({
      server,
      path: wsPath,
    });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      (ws as any).isAlive = true;

      ws.on('pong', () => {
        (ws as any).isAlive = true;
      });

      // Send recent logs immediately to newly connected client
      for (const log of this.recentLogs) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'log',
            payload: { message: log.message },
            timestamp: Date.now(),
          }));
        }
      }

      // Welcome handshake
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'connected',
          payload: { message: 'Curator WebSocket stream active' },
          timestamp: Date.now(),
        }));
      }

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
        } catch (_) {}
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });

    // Prune dead sockets every 30 seconds
    this.pingInterval = setInterval(() => {
      if (!this.wss) return;
      for (const client of this.clients) {
        if ((client as any).isAlive === false) {
          this.clients.delete(client);
          client.terminate();
          continue;
        }
        (client as any).isAlive = false;
        client.ping();
      }
    }, 30000);

    return this.wss;
  }

  public close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    for (const client of this.clients) {
      try {
        client.close(1000, 'Host shutdown');
      } catch (_) {}
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
