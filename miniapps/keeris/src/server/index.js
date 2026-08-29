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
const databasePath = process.env.DATABASE_PATH ?? config.defaultDatabase;
const webRoot = join(root, 'web-dist');
const db = openDatabase(databasePath);
const engine = await registerKeerisPlugins({ db });
let curatorRuntime = null;
const curatorDbName = process.env.CURATOR_DATABASE_NAME ?? 'keeris';
if (curatorDbName) {
  try {
    curatorRuntime = await startCuratorRuntime({ databaseName: curatorDbName });
  } catch (error) {
    console.error(`[Keeris] Curator runtime failed to start: ${error.message}`);
  }
}
const indexer = startIndexer({
  databasePath,
  curatorRuntime,
  intervalMs: Number(process.env.INDEX_INTERVAL_MS ?? 60_000),
  runImmediate: true,
});
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_request, response) => {
  try {
    const stats = db.prepare('SELECT COUNT(*) AS episodes FROM episodes').get();
    response.json({ status: 'ok', database: 'ready', processor: curatorRuntime ? 'ready' : 'standalone', plugins: engine.plugins.map((plugin) => plugin.name), episodes: stats.episodes });
  } catch (error) {
    response.status(503).json({ status: 'error', database: 'unavailable', error: error.message });
  }
});

app.post('/graphql', async (request, response) => {
  if (typeof request.body?.query !== 'string') return response.status(400).json({ errors: [{ message: 'query is required' }] });
  const result = await executeGraphql(db, request.body.query, request.body.variables, { curatorRuntime });
  response.status(result.errors ? 400 : 200).json(result);
});

if (existsSync(webRoot)) {
  app.use(express.static(webRoot, { index: 'index.html' }));
  app.get('/{*splat}', (_request, response) => response.sendFile(join(webRoot, 'index.html')));
}

const server = app.listen(port, () => console.log(`Keeris listening on http://localhost:${port}`));

function shutdown() {
  indexer?.stop();
  curatorRuntime?.stop().finally(() => server.close(() => { db.close(); process.exit(0); }));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);