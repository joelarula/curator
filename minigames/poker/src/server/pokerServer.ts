import http from 'node:http';
import { WebSocket } from 'ws';
import { createPokerGameSession, type PokerGameSession, type PokerSessionOptions } from '../session/pokerSession.ts';
import { executePokerGraphQL, POKER_SCHEMA_SDL } from '../graphql/index.ts';
import { createPokerHost } from '../host.ts';
import { handlePokerMessage } from '../shared/pokerMessage.ts';

import type { CuratorHost } from '../curatorHost.ts';

export interface PokerServerOptions extends PokerSessionOptions {
  port?: number;
  host?: string;
  curatorHost?: CuratorHost;
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

async function parseJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Creates and boots the standalone AST-Driven Poker Server.
 * Exposes WebSocket real-time event streaming and REST control endpoints
 * powered by the shared PokerGameSession core. Supports multiple concurrent tables.
 */
export async function createPokerServer(options: PokerServerOptions = {}): Promise<PokerServerInstance> {
  const port = options.port || parseInt(process.env.PORT || '4000', 10);
  const hostAddr = options.host || '127.0.0.1';
  const pollInterval = options.pollInterval || 300;

  if (!options.quiet) {
    console.log(`\x1b[90m[Poker Server] Initializing Host runtime & SQLite database...\x1b[0m`);
  }

  const ownsHost = !options.curatorHost;

  // 1. Boot or attach to the process host runtime
  const host = options.curatorHost || await createPokerHost({
    ...options,
    intervalMs: pollInterval,
  });

  // 2. Initialize the shared poker session inside the host
  const session = await createPokerGameSession(host, {
    ...options,
    intervalMs: pollInterval,
  });

  const { prisma, conversation } = session;

  // Ensure default table exists for incoming players
  const existingTables = await session.listTables();
  if (existingTables.length === 0) {
    await session.createTable({ title: 'Table #1' });
  }

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
      const tables = await session.listTables();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'online',
          service: 'curator-poker-server',
          database: session.host.config.curatorDb?.path,
          defaultTableId: session.tableId,
          activeTablesCount: tables.length,
          tables,
          pollInterval,
        })
      );
      return;
    }

    // GraphQL HTTP Endpoint
    if (req.method === 'POST' && url.pathname === '/graphql') {
      try {
        const body = await parseJsonBody(req);
        const query = body.query;
        if (typeof query !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ errors: [{ message: 'query is required' }] }));
          return;
        }
        const sessionId = (req.headers['x-session-id'] as string) || url.searchParams.get('sessionId') || undefined;
        const result = await executePokerGraphQL({
          session,
          query,
          variables: body.variables,
          context: { sessionId },
        });
        res.writeHead(result.errors ? 400 : 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ errors: [{ message: err.message }] }));
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/graphql') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(POKER_SCHEMA_SDL);
      return;
    }

    // List all tables
    if (req.method === 'GET' && url.pathname === '/api/tables') {
      const tables = await session.listTables();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: tables.length, tables }));
      return;
    }

    // Create a new table
    if (req.method === 'POST' && url.pathname === '/api/tables') {
      try {
        const body = await parseJsonBody(req);
        const newTable = await session.createTable(body);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, table: newTable }));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Table-specific matching: /api/tables/:tableId[/action|/speech|/waiting|/standings]
    const tableRouteMatch = url.pathname.match(/^\/api\/tables\/([^/]+)(?:\/(action|speech|waiting|standings))?$/);
    if (tableRouteMatch) {
      const tableId = tableRouteMatch[1];
      const subRoute = tableRouteMatch[2];

      if (req.method === 'GET' && !subRoute) {
        const table = await session.getTable(tableId);
        if (!table) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Table ${tableId} not found` }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, table }));
        return;
      }

      if (req.method === 'GET' && subRoute === 'waiting') {
        const waitingTurn = await session.getWaitingHumanTurn(tableId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, waiting: waitingTurn !== null, turn: waitingTurn }));
        return;
      }

      if (req.method === 'GET' && subRoute === 'standings') {
        const standings = await session.getStandings(tableId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tableId, standings }));
        return;
      }

      if (req.method === 'POST' && subRoute === 'action') {
        try {
          const body = await parseJsonBody(req);
          const sessionId = (req.headers['x-session-id'] as string) || body.sessionId || undefined;
          const result = await session.submitAction(body.action || body, { tableId, sessionId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (req.method === 'POST' && subRoute === 'speech') {
        try {
          const body = await parseJsonBody(req);
          const sessionId = (req.headers['x-session-id'] as string) || body.sessionId || undefined;
          const result = await session.submitSpeech(body, { tableId, sessionId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }
    }

    // Backward-compatible default table human action
    if (req.method === 'POST' && url.pathname === '/api/poker/action') {
      try {
        const parsed = await parseJsonBody(req);
        const targetTableId = parsed.tableId || session.tableId;
        const sessionId = (req.headers['x-session-id'] as string) || parsed.sessionId || undefined;
        const result = await session.submitAction(parsed.action || parsed, { tableId: targetTableId, sessionId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  // 3. Attach WebSocket event stream
  const wsPath = '/api/events';
  const wss = host.events.attachWebSocketServer(server, wsPath);

  // Forward host events to active GraphQL subscriptions
  host.events.on('event', (event) => {
    (wss as any).clients?.forEach((client: any) => {
      if (client.readyState === WebSocket.OPEN && client.graphqlSubs) {
        client.graphqlSubs.forEach((sub: any) => {
          if (sub.tableId && event.tableId && String(sub.tableId) !== String(event.tableId)) {
            return;
          }
          try {
            client.send(
              JSON.stringify({
                id: sub.id,
                type: 'next',
                payload: {
                  data: {
                    tableEvents: {
                      type: event.type,
                      payload: typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload),
                      sessionId: event.sessionId || null,
                      tableId: event.tableId ? String(event.tableId) : null,
                      conversationId: event.conversationId ? Number(event.conversationId) : null,
                      timestamp: event.timestamp,
                    },
                  },
                },
              })
            );
          } catch (_) {}
        });
      }
    });
  });

  // 4. Handle incoming WebSocket client messages (GraphQL over WS, human action & speech dispatch)
  wss.on('connection', async (ws: WebSocket, req: any) => {
    (ws as any).graphqlSubs = new Map();

    // Register connecting player identity into database
    if (req?.url) {
      try {
        const parsedUrl = new URL(req.url, 'http://localhost');
        const playerName = parsedUrl.searchParams.get('playerName');
        const playerId = parsedUrl.searchParams.get('playerId');
        if (playerName) {
          const { ensureHumanActorInDatabase } = await import('../session/pokerSession.ts');
          await ensureHumanActorInDatabase(host, session.conversation.id, {
            playerName,
            playerId: playerId || undefined,
          });
        }
      } catch (_) {}
    }

    ws.on('message', async (data: any) => {
      try {
        const msg = JSON.parse(data.toString());
        const tableId = msg.tableId || msg.table || (ws as any).tableFilter || session.tableId;
        const sessionId = msg.sessionId || (ws as any).sessionId;

        if (msg.playerName) {
          const { ensureHumanActorInDatabase } = await import('../session/pokerSession.ts');
          await ensureHumanActorInDatabase(host, session.conversation.id, {
            playerName: msg.playerName,
            playerId: msg.playerId,
          });
        }

        // GraphQL-over-WS: connection_init handshake
        if (msg.type === 'connection_init') {
          ws.send(JSON.stringify({ type: 'connection_ack', sessionId: (ws as any).sessionId }));
          return;
        }

        // GraphQL-over-WS: subscribe (query, mutation, or real-time subscription)
        if (msg.type === 'subscribe') {
          if (msg.payload?.query) {
            const rawQuery = msg.payload.query.trim();
            if (rawQuery.startsWith('subscription') || rawQuery.includes('subscription')) {
              const subTableId = msg.payload.variables?.tableId || tableId;
              (ws as any).graphqlSubs.set(msg.id, {
                id: msg.id,
                tableId: subTableId,
                sessionId,
              });
            } else {
              // Direct query or mutation over WebSocket
              const result = await executePokerGraphQL({
                session,
                query: rawQuery,
                variables: msg.payload.variables,
                context: { sessionId },
              });
              ws.send(JSON.stringify({ id: msg.id, type: 'next', payload: result }));
              ws.send(JSON.stringify({ id: msg.id, type: 'complete' }));
            }
            return;
          } else {
            // Raw table filter subscribe
            const table = msg.tableId ?? msg.table ?? msg.conversationId;
            if (table !== undefined && table !== null) {
              (ws as any).tableFilter = String(table);
            }
          }
        }

        // GraphQL-over-WS: complete
        if (msg.type === 'complete' && msg.id) {
          (ws as any).graphqlSubs.delete(msg.id);
          return;
        }

        // Direct query / mutation message over WebSocket
        if (msg.type === 'query' || msg.type === 'mutation') {
          const result = await executePokerGraphQL({
            session,
            query: msg.query,
            variables: msg.variables,
            context: { sessionId },
          });
          ws.send(JSON.stringify({ id: msg.id, type: 'result', sessionId, ...result }));
          return;
        }

        // Unified message handling via shared module
        await handlePokerMessage(msg, session, { tableId, sessionId });
      } catch (_) {}
    });
  });

  // 5. Start RequestProcessor polling loop
  if (!options.quiet) {
    console.log(`\x1b[90m[Poker Server] Starting background RequestProcessor polling loop (${pollInterval}ms)...\x1b[0m`);
  }
  await host.start(pollInterval);

  // 6. Start HTTP listener
  if (!options.quiet) {
    console.log(`\x1b[90m[Poker Server] Binding HTTP & WebSocket listener on ${hostAddr}:${port}...\x1b[0m`);
  }
  await new Promise<void>((resolve) => {
    server.listen(port, hostAddr, () => resolve());
  });

  const url = `http://${hostAddr}:${port}`;
  const wsUrl = `ws://${hostAddr}:${port}${wsPath}`;

  const stop = async () => {
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    await session.close();
    if (ownsHost) {
      await host.stop();
    }
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
