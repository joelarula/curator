import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAppConfig,
  loadEnvFiles as loadHostEnvFiles,
  profilesEnvKey,
  profilesFromArgv,
  type AppConfig,
} from '../../../packages/host/dist/appConfig.js'; // direct module: keeps CLI boot free of the full host
import type { PokerConfig } from './pokerConfig.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODULE_ROOT = path.resolve(__dirname, '..');

/** App id for host app config: `poker.config.<profile>.yaml`, `.env.<profile>`, `POKER_PROFILES`. */
export const POKER_APP_ID = 'poker';

/** Where `.env` files are looked up: cwd, the poker module root, then its parents (repo-level `.env`). */
const ENV_DIRS = [process.cwd(), MODULE_ROOT, path.resolve(MODULE_ROOT, '..'), path.resolve(MODULE_ROOT, '../..')];

let envLoaded = false;

/**
 * Loads `.env` / `.env.<profile>` files (cwd, module root, parents) without overriding existing env vars.
 * Profiles come from `--profile`, then `POKER_PROFILES` / `CURATOR_PROFILES`; `--profile` is exported as `POKER_PROFILES`
 * so later config loads see the same profiles.
 */
export function loadEnvFiles(): void {
  if (envLoaded) return;
  envLoaded = true;
  const fromArgv = profilesFromArgv(process.argv);
  if (fromArgv?.length) process.env[profilesEnvKey(POKER_APP_ID)] = fromArgv.join(',');
  loadHostEnvFiles({ appId: POKER_APP_ID, dirs: ENV_DIRS });
}

/**
 * Returns the effective Gemini / Google API key if available.
 */
export function getGeminiApiKey(): string | undefined {
  loadEnvFiles();
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

export interface PokerAppConfigOptions {
  /** Explicit base config file (default: `POKER_CONFIG`, then `poker.config.*` in cwd, then the module root). */
  configPath?: string;
  /** Active profiles (default: `--profile`, `POKER_PROFILES`, `CURATOR_PROFILES`, `profiles.active`). */
  profiles?: string | string[];
}

/** Poker's layered config: `poker.config.*` plus `poker.config.<profile>.*`, and the `host:` section. */
export function loadPokerAppConfig(options: PokerAppConfigOptions = {}): AppConfig<PokerConfig> {
  loadEnvFiles();
  return loadAppConfig<PokerConfig>({
    appId: POKER_APP_ID,
    profiles: options.profiles,
    configPath: options.configPath || process.env.POKER_CONFIG || undefined,
    searchDirs: [process.cwd(), MODULE_ROOT],
    envDirs: ENV_DIRS,
  });
}

/** Reads the poker config (base file plus active profile files); an explicit path that is missing or broken throws. */
export function loadPokerConfigFile(explicitPath?: string): PokerConfig {
  return loadPokerAppConfig({ configPath: explicitPath }).values;
}

// Redirect noisy library warnings (e.g. @google/genai redundant key notice)
const origConsoleWarn = console.warn;
console.warn = (...args: any[]) => {
  if (typeof args[0] === 'string' && args[0].includes('Both GOOGLE_API_KEY and GEMINI_API_KEY are set')) {
    return;
  }
  origConsoleWarn(...args);
};

// Auto-load on initial import
loadEnvFiles();

