import { EventEmitter } from 'node:events';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

export interface CuratorEvent {
  type: string;
  payload: any;
  timestamp: number;
}

class CuratorEventBus extends EventEmitter {
  private recentLogs: Array<{ type: string; message: string; time: string }> = [];
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;

  broadcast(type: string, payload: any) {
    const time = new Date().toLocaleTimeString();
    if (type === 'log') {
      this.recentLogs.push({ type: 'info', message: payload?.message || String(payload), time });
      if (this.recentLogs.length > 200) this.recentLogs.shift();
    } else if (type === 'error') {
      this.recentLogs.push({ type: 'error', message: payload?.message || String(payload), time });
      if (this.recentLogs.length > 200) this.recentLogs.shift();
    }

    const event: CuratorEvent = { type, payload, timestamp: Date.now() };
    this.emit('event', event);

    // Push real-time event to all active WebSocket clients
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

  getRecentLogs() {
    return this.recentLogs;
  }

  attachWebSocketServer(server: HttpServer) {
    if (this.wss) return this.wss;

    this.wss = new WebSocketServer({
      server,
      path: '/api/curator/ws',
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
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

      // Welcome message
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

    // Heartbeat to prune dead socket connections every 30 seconds
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

  close() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    for (const client of this.clients) {
      try {
        client.close(1000, 'Server shutdown');
      } catch (_) {}
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}

export const curatorEvents = new CuratorEventBus();

