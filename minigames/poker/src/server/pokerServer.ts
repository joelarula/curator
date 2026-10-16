import http from 'node:http';
import { WebSocket } from 'ws';
import { createPokerGameSession, type PokerGameSession, type PokerSessionOptions } from '../session/pokerSession.js';
import type { CuratorHost } from '@curator/host';

export interface PokerServerOptions extends PokerSessionOptions {
  port?: number;
  host?: string;
  pollInterval?: number;
}

export interface PokerServerInstance {
  server: http.Server;
  session: PokerGameSession;
  host: CuratorHost;
  port: number;
  url: string;
  wsUrl: string;
  prisma: any;
  conversation: any;
  stop: () => Promise<void>;
}

/**
 * Creates and boots the standalone AST-Driven Poker Server.
 * Exposes WebSocket real-time event streaming and REST control endpoints
 * powered by the shared PokerGameSession core.
 */
export async function createPokerServer(options: PokerServerOptions = {}): Promise<PokerServerInstance> {
  const port = options.port || parseInt(process.env.PORT || '4000', 10);
  const hostAddr = options.host || '127.0.0.1';
  const pollInterval = options.pollInterval || 300;

  // 1. Initialize the shared unified session
  const session = await createPokerGameSession({
    ...options,
    intervalMs: pollInterval,
  });

  const { prisma, conversation, host } = session;

  // 2. Create HTTP Server for health, REST APIs, and WebSocket upgrading
  const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'online',
          service: 'curator-poker-server',
          database: session.host.config.curatorDb?.path,
          conversationId: conversation.id,
          pollInterval,
        })
      );
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/poker/action') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const action = parsed.action || parsed;
          await session.submitHumanAction(action);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, action }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  // 3. Attach WebSocket event stream
  const wsPath = '/api/events';
  const wss = host.events.attachWebSocketServer(server, wsPath);

  // 4. Handle incoming WebSocket client messages (human action & speech dispatch)
  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', async (data: any) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'poker:human_action') {
          const action = msg.payload || msg.action;
          await session.submitHumanAction(action);
        } else if (msg.type === 'poker:speech') {
          await session.submitHumanSpeech({
            text: msg.payload?.text,
            speechAct: msg.payload?.speechAct,
            targetId: msg.payload?.targetId,
          });
        }
      } catch (_) {}
    });
  });

  // 5. Start RequestProcessor polling loop
  await host.start(pollInterval);

  // 6. Start HTTP listener
  await new Promise<void>((resolve) => {
    server.listen(port, hostAddr, () => resolve());
  });

  const url = `http://${hostAddr}:${port}`;
  const wsUrl = `ws://${hostAddr}:${port}${wsPath}`;

  const stop = async () => {
    await session.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };

  return {
    server,
    session,
    host,
    port,
    url,
    wsUrl,
    prisma,
    conversation,
    stop,
  };
}
