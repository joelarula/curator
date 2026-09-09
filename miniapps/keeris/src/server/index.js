import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../db.js';
import { config } from '../config.js';
import { registerKeerisPlugins } from '../plugins/index.js';
import { executeGraphql } from './graphql.js';
import { startIndexer } from '../indexer.js';
import { startCuratorRuntime } from '../curator-runtime.js';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const port = Number(process.env.PORT ?? 4000);
const databasePath = process.env.DATABASE_URL || process.env.DATABASE_PATH || config.defaultDatabase;
const webRoot = join(root, 'web-dist');
console.log('[Keeris Server] Initializing database...');
const db = openDatabase(databasePath);
console.log('[Keeris Server] Registering plugins...');
const engine = await registerKeerisPlugins({ db });
let curatorRuntime = null;
const curatorDbName = process.env.CURATOR_DATABASE_NAME ?? 'keeris';
if (curatorDbName) {
  try {
    console.log(`[Keeris Server] Starting Curator runtime (${curatorDbName})...`);
    curatorRuntime = await startCuratorRuntime({ databaseName: curatorDbName });
  } catch (error) {
    console.error(`[Keeris] Curator runtime failed to start: ${error.message}`);
  }
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
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
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
      database: db.isPostgres ? 'postgresql' : 'sqlite',
      processor: curatorRuntime ? 'ready' : 'standalone',
      plugins: engine.plugins.map((plugin) => plugin.name),
      episodes: Number(stats?.episodes || 0)
    });
  } catch (error) {
    response.status(503).json({ status: 'error', database: 'unavailable', error: error.message });
  }
});

app.get('/graphql', (_request, response) => {
  response.type('html').send(`<!DOCTYPE html>
<html>
<head>
  <title>Keeris WASM / GraphQL Explorer</title>
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
  console.log(`[Keeris Server] Serving static WebAssembly bundle from: ${webRoot}`);
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