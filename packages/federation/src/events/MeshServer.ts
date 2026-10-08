import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { MeshEventBridge } from './MeshEventBridge.js';
import type { MeshEnvelope } from '../types.js';

export class MeshServer {
  private wss?: WebSocketServer;
  private clients = new Set<WebSocket>();

  constructor(
    private bridge: MeshEventBridge,
    private options: { port?: number; server?: HttpServer; path?: string }
  ) {
    this.init();
  }

  private init(): void {
    if (this.options.server) {
      this.wss = new WebSocketServer({
        server: this.options.server,
        path: this.options.path ?? '/api/mesh/events',
      });
    } else if (this.options.port) {
      this.wss = new WebSocketServer({
        port: this.options.port,
        path: this.options.path ?? '/api/mesh/events',
      });
    }

    if (this.wss) {
      this.wss.on('connection', (ws: WebSocket) => {
        this.clients.add(ws);

        ws.on('message', (data: any) => {
          try {
            const envelope: MeshEnvelope = JSON.parse(data.toString());
            this.bridge.handleIncomingEnvelope(envelope);
          } catch (err) {
            console.warn('[MeshServer] Invalid message received from peer:', err);
          }
        });

        ws.on('close', () => {
          this.clients.delete(ws);
        });

        ws.on('error', () => {
          this.clients.delete(ws);
        });
      });
    }
  }

  public broadcastToIncoming(envelope: MeshEnvelope): void {
    const payloadStr = JSON.stringify(envelope);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payloadStr);
      }
    }
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.clients) {
        client.close();
      }
      this.clients.clear();
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
