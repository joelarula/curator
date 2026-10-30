import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { findConfigFile, loadConfigFile } from '@curator/agent-server';
import type { CuratorHostConfig } from './types.js';

/** Host settings an app config file may carry under its reserved `host:` key. */
export type AppHostSettings = Partial<
  Pick<CuratorHostConfig, 'profile' | 'definitions' | 'retention' | 'astStorage' | 'logLevel' | 'intervalMs' | 'approvalTtlMs'>
>;

type Env = Record<string, string | undefined>;

export interface AppConfigOptions {
  /** App name: config files are `<appId>.config.*`, profiles env var is `<APPID>_PROFILES`. */
  appId: string;
  /** Active profiles (`'dev,local'` or a list); default: `<APPID>_PROFILES`, `CURATOR_PROFILES`, then `profiles.active` in the base file. */
  profiles?: string | string[];
  /** Explicit base config file; profile files are looked up next to it (`x.yaml` -> `x.<profile>.yaml`). */
  configPath?: string;
  /** Directories searched for config files, first match wins (default: cwd). */
  searchDirs?: string[];
  /** Directories searched for `.env` / `.env.<profile>` (default: `searchDirs`); earlier dirs win. */
  envDirs?: string[];
  /** Environment to read and fill (default: `process.env`). */
  env?: Env;
}

export interface AppConfig<T = Record<string, any>> {
  appId: string;
  activeProfiles: string[];
  /** Merged config without the reserved `profiles` and `host` keys. */
  values: T;
  /** The `host:` section, to spread into `createCuratorHost` before explicit options. */
  host: AppHostSettings;
  /** Files applied, lowest precedence first. */
  sources: string[];
}

/** Splits `'dev, local'` / `['dev', 'local']` into unique, trimmed names. */
export function parseProfiles(value: string | string[] | undefined | null): string[] {
  const list = Array.isArray(value) ? value : (value || '').split(',');
  return [...new Set(list.map((p) => String(p).trim()).filter(Boolean))];
}

export function profilesEnvKey(appId: string): string {
  return `${appId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_PROFILES`;
}

/** Reads `--profile a,b` / `--profile=a,b` from argv (for app entry points that run before their CLI parser). */
export function profilesFromArgv(argv: string[] = process.argv): string[] | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--profile') return parseProfiles(argv[i + 1]);
    if (argv[i].startsWith('--profile=')) return parseProfiles(argv[i].slice('--profile='.length));
  }
  return undefined;
}

function readEnvFile(file: string): Env | null {
  try {
    return parseEnv(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function profilesFromEnv(appId: string, env: Env): string[] {
  return parseProfiles(env[profilesEnvKey(appId)] || env.CURATOR_PROFILES);
}

export interface LoadEnvFilesOptions {
  appId: string;
  dirs: string[];
  profiles?: string | string[];
  env?: Env;
}

/**
 * Fills `env` from `.env.<profile>` and `.env` files; variables already set are never overwritten.
 * Precedence: existing env > `.env.<last profile>` > ... > `.env`, and within a layer earlier dirs win.
 * Without explicit profiles, `<APPID>_PROFILES` / `CURATOR_PROFILES` from the env or the base `.env` files apply.
 */
export function loadEnvFiles(options: LoadEnvFilesOptions): { profiles: string[]; sources: string[] } {
  const env = options.env ?? process.env;
  const base = options.dirs
    .map((dir) => path.resolve(dir, '.env'))
    .map((file) => ({ file, vars: readEnvFile(file) }))
    .filter((l): l is { file: string; vars: Env } => l.vars !== null);

  let profiles = parseProfiles(options.profiles);
  if (!profiles.length) profiles = profilesFromEnv(options.appId, env);
  if (!profiles.length) profiles = profilesFromEnv(options.appId, Object.assign({}, ...[...base].reverse().map((l) => l.vars)));

  const layers = [
    ...[...profiles].reverse().flatMap((p) =>
      options.dirs
        .map((dir) => path.resolve(dir, `.env.${p}`))
        .map((file) => ({ file, vars: readEnvFile(file) }))
        .filter((l): l is { file: string; vars: Env } => l.vars !== null),
    ),
    ...base,
  ];
  for (const { vars } of layers) {
    for (const [key, value] of Object.entries(vars)) {
      if (env[key] === undefined) env[key] = value;
    }
  }
  return { profiles, sources: layers.map((l) => l.file).reverse() };
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep merge of plain objects; arrays and scalars from later layers replace earlier ones. */
export function mergeConfig<T extends Record<string, any>>(...layers: Array<Record<string, any> | undefined>): T {
  const out: Record<string, any> = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer || {})) {
      out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeConfig(out[key], value) : value;
    }
  }
  return out as T;
}

/**
 * Spring-style application profiles. Layers, later winning:
 * `.env`, `.env.<profile>` (never over existing env vars), `<appId>.config.*`, `<appId>.config.<profile>.*` per active profile.
 */
export function loadAppConfig<T = Record<string, any>>(options: AppConfigOptions): AppConfig<T> {
  const env = options.env ?? process.env;
  const searchDirs = options.searchDirs ?? [process.cwd()];

  const envResult = loadEnvFiles({ appId: options.appId, dirs: options.envDirs ?? searchDirs, profiles: options.profiles, env });

  const baseFile = options.configPath ? path.resolve(options.configPath) : findConfigFile(`${options.appId}.config`, searchDirs);
  const base = baseFile ? loadConfigFile(baseFile) : {};

  let profiles = envResult.profiles;
  if (!profiles.length) {
    profiles = parseProfiles((base as any)?.profiles?.active);
    // `.env.<profile>` for profiles only the config file named
    if (profiles.length) loadEnvFiles({ appId: options.appId, dirs: options.envDirs ?? searchDirs, profiles, env });
  }

  const sources = [...envResult.sources];
  const layers: Record<string, any>[] = [base];
  if (baseFile) sources.push(baseFile);
  for (const p of profiles) {
    const file =
      (baseFile && findConfigFile(`${path.basename(baseFile, path.extname(baseFile))}.${p}`, [path.dirname(baseFile)])) ||
      findConfigFile(`${options.appId}.config.${p}`, searchDirs);
    if (!file) continue;
    layers.push(loadConfigFile(file));
    sources.push(file);
  }

  const { profiles: _profiles, host, ...values } = mergeConfig(...layers);
  return {
    appId: options.appId,
    activeProfiles: profiles,
    values: values as T,
    host: isPlainObject(host) ? (host as AppHostSettings) : {},
    sources,
  };
}
