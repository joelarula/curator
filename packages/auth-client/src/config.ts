import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AuthConfigError } from './errors.js';
import type { AuthConfig } from './types.js';

export function defaultAuthConfigPath(): string {
  return process.env.CURATOR_AUTH_CONFIG || path.join(os.homedir(), '.curator', 'auth.json');
}

/**
 * Loads IdP and service connection settings (no secrets beyond optional client secrets).
 * A missing file yields an empty config so services can still rely on discovery.
 */
export async function loadAuthConfig(file: string = defaultAuthConfigPath()): Promise<AuthConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err: any) {
    if (err?.code === 'ENOENT') return {};
    throw err;
  }
  let config: AuthConfig;
  try {
    config = JSON.parse(raw);
  } catch (err: any) {
    throw new AuthConfigError(`Invalid JSON in ${file}: ${err.message}`);
  }
  validateAuthConfig(config, file);
  return config;
}

export function validateAuthConfig(config: AuthConfig, source = 'auth config'): void {
  for (const [name, idp] of Object.entries(config.idps ?? {})) {
    if (!idp?.issuer || (!idp.clientId && idp.registration !== 'dynamic')) {
      throw new AuthConfigError(`${source}: idp "${name}" needs issuer and clientId (or registration: "dynamic")`);
    }
  }
  for (const [name, service] of Object.entries(config.services ?? {})) {
    if (!service?.url) throw new AuthConfigError(`${source}: service "${name}" needs url`);
    if (service.idp && !config.idps?.[service.idp]) {
      throw new AuthConfigError(`${source}: service "${name}" references unknown idp "${service.idp}"`);
    }
  }
}
