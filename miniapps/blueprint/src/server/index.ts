import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlueprintRuntime } from '../host.js';
import { createCuratorServer } from '@curator/server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  const { host, config, activeProfiles } = await createBlueprintRuntime();
  const webDistPath = path.resolve(__dirname, '../../web-dist');

  const server = await createCuratorServer(host, {
    port: config.server.port,
    webDistPath,
  });
  if (activeProfiles.length) console.log(`[Blueprint Server] Active profiles: ${activeProfiles.join(', ')}`);

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
