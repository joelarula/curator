import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const port = Number(process.env.PORT ?? 4000);
const webRoot = existsSync(join(root, 'web-dist'))
  ? join(root, 'web-dist')
  : join(root, 'dist');
const dataDir = join(root, 'data');

const app = express();

app.disable('x-powered-by');

// Required for OPFS FileSystemSyncAccessHandle & SharedArrayBuffer isolation
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Serve database seed files
app.use('/data', express.static(dataDir));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode: 'wasm-opfs-sqlite',
    webRoot,
  });
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
  app.get('/{*splat}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(join(webRoot, 'index.html'));
  });
}

const server = app.listen(port, () => {
  console.log(`[Keeris WASM App] Running at http://localhost:${port}`);
});

process.once('SIGINT', () => server.close(() => process.exit(0)));
process.once('SIGTERM', () => server.close(() => process.exit(0)));
