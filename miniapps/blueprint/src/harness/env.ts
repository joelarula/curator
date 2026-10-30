import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthConfig } from '../../../../packages/auth-client/dist/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BLUEPRINT_ROOT = path.resolve(here, '../..');

/** Loads blueprint/.env, then the workspace .env; variables already set in the environment win. */
export function loadBlueprintEnv(): void {
  for (const file of [path.join(BLUEPRINT_ROOT, '.env'), path.resolve(BLUEPRINT_ROOT, '../../.env')]) {
    if (fs.existsSync(file)) process.loadEnvFile(file);
  }
}

/** Auth service (and MCP server) name of the blueprint server in the harness. */
export const BLUEPRINT_SERVICE = 'blueprint';
export const GOOGLE_IDP = 'google';

export function blueprintMcpUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.BLUEPRINT_MCP_URL || 'http://127.0.0.1:4200/mcp';
}

/**
 * Google sign-in for the REPL: device flow with the "TVs and Limited Input devices" client
 * (CLIENT_ID_BLUEPRINT / CLIENT_SECRET_BLUEPRINT), scopes `openid email`. The blueprint server
 * gets the Google id_token as bearer and verifies it against Google's JWKS.
 * Returns null when the device client is not configured.
 */
export function harnessAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig | null {
  const clientId = env.CLIENT_ID_BLUEPRINT;
  if (!clientId) return null;
  return {
    idps: {
      [GOOGLE_IDP]: {
        issuer: 'https://accounts.google.com',
        clientId,
        clientSecret: env.CLIENT_SECRET_BLUEPRINT,
        flow: 'device',
        scope: 'openid email',
        audienceParam: 'none',
      },
    },
    services: {
      [BLUEPRINT_SERVICE]: { url: blueprintMcpUrl(env), kind: 'mcp', idp: GOOGLE_IDP, bearer: 'id_token' },
    },
  };
}
