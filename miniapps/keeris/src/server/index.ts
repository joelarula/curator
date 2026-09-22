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
import { registerKeerisPlugins } from '../plugins/index.ts';
import { executeGraphql } from './graphql.ts';
import { startIndexer } from '../indexer.ts';
import { startCuratorRuntime } from '../curator-runtime.ts';

const port = process.env.PORT || 4001;
const databasePath = process.env.DATABASE_URL || process.env.DATABASE_PATH || config.defaultDatabase;
const webRoot = existsSync(join(root, 'web-dist', 'server'))
  ? join(root, 'web-dist', 'server')
  : join(root, 'web-dist');

console.log('[Keeris Server] Initializing database...');
console.log(`[Keeris Server] Database target: ${databasePath.replace(/:[^:@]+@/, ':****@')}`);
const db = openDatabase(databasePath);

console.log('[Keeris Server] Registering plugins...');
let engine: any = null;
registerKeerisPlugins({ db })
  .then(res => { engine = res; })
  .catch(err => console.error('[Keeris Server] Plugin registration error:', err));

let curatorRuntime: any = null;
const curatorDbName = process.env.CURATOR_DATABASE_NAME ?? 'keeris';

if (curatorDbName) {
  console.log(`[Keeris Server] Starting Curator runtime (${curatorDbName})...`);
  startCuratorRuntime({ databaseName: curatorDbName, keerisDb: db })
    .then(runtime => {
      curatorRuntime = runtime;
      console.log(`[Keeris Server] Curator runtime ready (${curatorDbName}).`);
    })
    .catch(error => {
      console.error(`[Keeris] Curator runtime notice: ${error?.message}`);
    });
}

console.log('[Keeris Server] Starting indexer...');
const indexer = startIndexer({
  databasePath,
  curatorRuntime,
  intervalMs: Number(process.env.INDEX_INTERVAL_MS ?? 60_000),
  runImmediate: false,
});

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
      processor: curatorRuntime ? 'ready' : 'standalone',
      plugins: engine?.plugins ? engine.plugins.map((plugin: any) => plugin.name) : ['core', 'keeris-domain', 'err-radio'],
      episodes: Number(stats?.episodes || 0)
    });
  } catch (error: any) {
    response.status(503).json({ status: 'error', database: 'unavailable', error: error?.message });
  }
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
    const fetcher = GraphiQL.createFetcher({ url: '/graphql' });
    const root = ReactDOM.createRoot(document.getElementById('graphiql'));
    root.render(React.createElement(GraphiQL, { fetcher, defaultQuery: '{ stats { episodes tracks uniqueTracks programs } }' }));
  </script>
</body>
</html>`);
});

app.post('/graphql', async (request, response) => {
  if (typeof request.body?.query !== 'string') return response.status(400).json({ errors: [{ message: 'query is required' }] });
  const result = await executeGraphql(db, request.body.query, request.body.variables, { curatorRuntime });
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

const server = app.listen(port, () => console.log(`Keeris listening on http://localhost:${port}`));

function shutdown() {
  indexer?.stop();
  curatorRuntime?.stop().finally(() => server.close(() => { db.close(); process.exit(0); }));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

export default app;
export { app, server };
