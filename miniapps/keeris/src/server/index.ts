import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const root = existsSync(join(currentDir, 'web-dist'))
  ? currentDir
  : existsSync(join(dirname(dirname(currentDir)), 'web-dist'))
    ? dirname(dirname(currentDir))
    : currentDir;

const envCandidates = [
  join(root, '.env'),
  join(currentDir, '.env'),
  join(process.cwd(), '.env'),
  join(root, '.env.production')
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
      console.log(`[Keeris Server] Loaded environment from: ${envPath}`);
      break;
    } catch {}
  }
}

import { openDatabase } from '../db.ts';
import { config } from '../config.ts';
import { createKeerisHost } from '../host.ts';
import { executeGraphql } from './graphql.ts';
import { setupAuth, getUserFromToken } from './auth.ts';
import { curatorEvents } from './events.ts';

const port = process.env.PORT || 4001;
const databasePath = process.env.DATABASE_URL || process.env.DATABASE_PATH || config.defaultDatabase;
const webRoot = existsSync(join(root, 'web-dist', 'server'))
  ? join(root, 'web-dist', 'server')
  : join(root, 'web-dist');

console.log('[Keeris Server] Initializing database...');
console.log(`[Keeris Server] Database target: ${databasePath.replace(/:[^:@]+@/, ':****@')}`);
const db = openDatabase(databasePath);

console.log('[Keeris Server] Initializing Curator Host...');
const host = await createKeerisHost({ domainDb: db });
await host.start(5000);
console.log('[Keeris Server] Curator host and RequestProcessor active.');

console.log('[Keeris Server] Configuring Express...');
const app = express();

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '256kb' }));

setupAuth(app, () => host.prisma);

const dataDir = join(root, 'data');
if (existsSync(dataDir)) {
  app.use('/data', express.static(dataDir));
}

app.get('/health', async (_request, response) => {
  try {
    const stats = await db.prepare('SELECT COUNT(*) AS episodes FROM episodes').get();
    response.json({
      status: 'ok',
      serverApi: true,
      mode: 'express-graphql',
      database: db.isMysql ? 'mariadb' : db.isPostgres ? 'postgresql' : 'sqlite',
      processor: 'ready',
      plugins: Array.from(host.engine.plugins.keys()),
      episodes: Number(stats?.episodes || 0)
    });
  } catch (error: any) {
    response.status(503).json({ status: 'error', database: 'unavailable', error: error?.message });
  }
});

// SSE endpoint for live Curator Console progress & logs
app.get('/api/curator/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const recent = host.events.getRecentLogs();
  for (const log of recent) {
    res.write(`data: ${JSON.stringify({ type: 'log', payload: { message: log.message } })}\n\n`);
  }

  const listener = (event: any) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (_) {}
  };

  const unsubscribe = host.events.onEvent(listener);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (_) {}
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    try { unsubscribe(); } catch (_) {}
  });
});

app.get('/api/curator/logs', (_req, res) => {
  res.json({ logs: host.events.getRecentLogs() });
});

app.get('/graphql', (_request, response) => {
  response.type('html').send(`<!DOCTYPE html>
<html>
<head>
  <title>Keeris GraphQL Explorer</title>
  <link rel="stylesheet" href="https://unpkg.com/graphiql@3/graphiql.min.css" />
  <style>body { height: 100vh; margin: 0; overflow: hidden; }</style>
</head>
<body>
  <div id="graphiql" style="height: 100vh;"></div>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/graphiql@3/graphiql.min.js"></script>
  <script>
    const fetcher = GraphiQL.createFetcher({
      url: '/graphql',
      headers: () => {
        const token = localStorage.getItem('keeris_token');
        return token ? { Authorization: 'Bearer ' + token } : {};
      },
    });
    const root = ReactDOM.createRoot(document.getElementById('graphiql'));
    root.render(React.createElement(GraphiQL, { fetcher, defaultQuery: '{ stats { episodes tracks uniqueTracks programs } }' }));
  </script>
</body>
</html>`);
});

app.post('/graphql', async (request, response) => {
  if (typeof request.body?.query !== 'string') return response.status(400).json({ errors: [{ message: 'query is required' }] });
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (request.query?.token as string);
  const user = token ? await getUserFromToken(token, host.prisma) : null;
  const result = await executeGraphql(db, request.body.query, request.body.variables, { curatorRuntime: host, user });
  response.status(result.errors ? 400 : 200).json(result);
});

if (existsSync(webRoot)) {
  console.log(`[Keeris Server] Serving static web frontend from: ${webRoot}`);
  app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });
  app.use(express.static(webRoot, { index: 'index.html' }));
  app.get('/', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.sendFile(join(webRoot, 'index.html'));
  });
  app.get('/{*splat}', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.sendFile(join(webRoot, 'index.html'));
  });
}

const server = app.listen(port, () => {
  console.log(`Keeris listening on http://localhost:${port}`);
  host.events.attachWebSocketServer(server);
  console.log(`[Keeris Server] Curator WebSocket stream ready on ws://localhost:${port}/api/events`);
});

let isShuttingDown = false;
async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('[Keeris Server] Shutting down gracefully...');

  const forceTimer = setTimeout(() => {
    console.log('[Keeris Server] Force exiting.');
    process.exit(0);
  }, 2000);
  forceTimer.unref();

  try {
    await host.stop();
  } catch (_) {}

  try {
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    if (typeof (server as any).closeIdleConnections === 'function') {
      (server as any).closeIdleConnections();
    }
  } catch (_) {}

  server.close(() => {
    try { db.close(); } catch (_) {}
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
if (process.platform === 'win32') {
  process.on('SIGBREAK', shutdown);
}

export default app;
export { app, server };
