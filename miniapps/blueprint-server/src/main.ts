import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppConfig, profilesFromArgv } from '@curator/host/config';
import { createBlueprintServer } from './createBlueprintServer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface BlueprintServerConfig {
  googleClientIds?: string[];
  allowedEmails?: string | string[];
  server?: { port?: number | string; host?: string; publicUrl?: string };
  databasePath?: string;
}

// blueprint-server.config.yaml + profiles; .env from this module, then the workspace root (GOOGLE_CLIENT_ID lives there).
const app = loadAppConfig<BlueprintServerConfig>({
  appId: 'blueprint-server',
  profiles: profilesFromArgv(),
  configPath: process.env.BLUEPRINT_SERVER_CONFIG || undefined,
  searchDirs: [process.cwd(), root],
  envDirs: [root, path.resolve(root, '../..')],
});
const config = app.values;

const allowedEmails = (Array.isArray(config.allowedEmails) ? config.allowedEmails : (config.allowedEmails ?? '').split(','))
  .map((e) => String(e).trim())
  .filter(Boolean);

const server = await createBlueprintServer({
  googleClientId: config.googleClientIds ?? [],
  allowedEmails,
  port: Number(config.server?.port ?? 4200),
  host: config.server?.host,
  publicUrl: config.server?.publicUrl,
  databasePath: path.resolve(root, config.databasePath ?? './data/curator.db'),
  logLevel: app.host.logLevel,
});
const profiles = app.activeProfiles.length ? app.activeProfiles.join(',') : 'default';
console.log(`[blueprint-server] MCP endpoint ${server.url} (profiles: ${profiles}; Google sign-in; allowed: ${allowedEmails.join(', ')})`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
