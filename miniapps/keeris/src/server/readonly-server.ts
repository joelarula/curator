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
      console.log(`[Keeris ReadOnly] Loaded environment from: ${envPath}`);
      break;
    } catch {}
  }
}

import { openDatabase } from '../db.ts';
import { config } from '../config.ts';
import { executeReadonlyGraphql } from './readonly-graphql.ts';

const port = process.env.PORT || 4001;
const databasePath = process.env.DATABASE_URL || process.env.DATABASE_PATH || config.defaultDatabase;
const webRoot = existsSync(join(root, 'web-dist', 'server'))
  ? join(root, 'web-dist', 'server')
  : existsSync(join(root, 'web-dist'))
    ? join(root, 'web-dist')
    : join(currentDir, 'web-dist');

console.log('[Keeris ReadOnly] Initializing database...');
console.log(`[Keeris ReadOnly] Target: ${databasePath.replace(/:[^:@]+@/, ':****@')}`);
const db = openDatabase(databasePath);

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

app.get('/health', async (_request, response) => {
  try {
    const stats = await db.prepare('SELECT COUNT(*) AS episodes FROM episodes').get();
    response.json({
      status: 'ok',
      mode: 'readonly',
      database: db.isMysql ? 'mariadb' : db.isPostgres ? 'postgresql' : 'sqlite',
      episodes: Number(stats?.episodes || 0)
    });
  } catch (error: any) {
    response.status(503).json({ status: 'error', database: 'unavailable', error: error?.message });
  }
});

app.post('/graphql', async (request, response) => {
  if (typeof request.body?.query !== 'string') {
    return response.status(400).json({ errors: [{ message: 'query is required' }] });
  }
  
  // Guard against any accidental mutation attempts
  if (/^\s*mutation\b/i.test(request.body.query)) {
    return response.status(403).json({ errors: [{ message: 'Mutations are disabled in read-only mode' }] });
  }

  const result = await executeReadonlyGraphql(db, request.body.query, request.body.variables);
  response.status(result.errors ? 400 : 200).json(result);
});

if (existsSync(webRoot)) {
  console.log(`[Keeris ReadOnly] Serving static web frontend from: ${webRoot}`);
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
  console.log(`Keeris ReadOnly listening on http://localhost:${port}`);
});

let isShuttingDown = false;
async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('[Keeris ReadOnly] Shutting down gracefully...');

  const forceTimer = setTimeout(() => {
    console.log('[Keeris ReadOnly] Force exiting.');
    process.exit(0);
  }, 2000);
  forceTimer.unref();

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
