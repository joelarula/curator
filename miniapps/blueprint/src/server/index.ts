import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlueprintHost } from '../host.js';
import { createCuratorServer } from '@curator/server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  const host = await createBlueprintHost();
  const webDistPath = path.resolve(__dirname, '../../../web-dist');

  const server = await createCuratorServer(host, {
    port: process.env.PORT ? Number(process.env.PORT) : 4100,
    webDistPath,
    pollingIntervalMs: 1000,
  });

  const { port } = await server.start();
  console.log(`[Blueprint Server] Web Frontend ready with Curator Console on http://localhost:${port}`);

  const shutdown = async () => {
    console.log('\n[Blueprint Server] Shutting down gracefully...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Blueprint Server] Fatal error:', err);
  process.exit(1);
});
