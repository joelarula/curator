import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlueprintServer } from './createBlueprintServer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Local .env first, then the workspace .env (GOOGLE_CLIENT_ID lives there); existing env vars win.
for (const file of [path.resolve(here, '../.env'), path.resolve(here, '../../../.env')]) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

const allowedEmails = (process.env.BLUEPRINT_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

const server = await createBlueprintServer({
  // Web client (browser sign-in) and the device client the REPL signs in with.
  googleClientId: [process.env.GOOGLE_CLIENT_ID ?? '', process.env.CLIENT_ID_BLUEPRINT ?? ''],
  allowedEmails,
  port: Number(process.env.BLUEPRINT_SERVER_PORT ?? 4200),
  publicUrl: process.env.BLUEPRINT_SERVER_PUBLIC_URL,
  databasePath: process.env.BLUEPRINT_SERVER_DB ?? path.resolve(here, '../data/curator.db'),
});
console.log(`[blueprint-server] MCP endpoint ${server.url} (Google sign-in; allowed: ${allowedEmails.join(', ')})`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
