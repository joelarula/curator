import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthConfig, IdpConfig } from '../../../../packages/auth-client/dist/index.js';
import type { FormatSpec } from '../../../../curator/dist/src/index.js';
import type { AccessLevel, McpServerExpectations } from '../../../../packages/plugin-mcp-client/dist/index.js';
import {
  loadAppConfig,
  mergeConfig,
  profilesFromArgv,
  resolvePlaceholders,
  type AppHostSettings,
} from '@curator/host/config';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BLUEPRINT_ROOT = path.resolve(here, '../..');

/** App id for host app config: `blueprint.config.<profile>.yaml`, `.env.<profile>`, `BLUEPRINT_PROFILES`. */
export const BLUEPRINT_APP_ID = 'blueprint';

/** Auth service (and MCP server) name of the blueprint server in the harness. */
export const BLUEPRINT_SERVICE = 'blueprint';
export const GOOGLE_IDP = 'google';

/** A remote MCP server the host registers in its project; its tools become `mcp.<name>.*`. */
export interface McpServerSettings {
  url: string;
  /** IdP (key of `auth`) whose session token is sent as bearer; omit for servers without sign-in. */
  idp?: string | null;
  bearer?: 'access_token' | 'id_token';
  /** `false` keeps a server from the defaults or a lower profile unregistered. */
  enabled?: boolean;
  /**
   * Result formatting per remote tool name (or `*` pattern), e.g. `web_scrape: { llm: [field:markdown], display: ... }`;
   * applies to `mcp.<server>.<tool>` and wins over the plugins' defaults.
   */
  output?: Record<string, { llm?: FormatSpec; display?: FormatSpec }>;
  /**
   * Tools expected from the server, registered before it is reached: `roles` (exactly these, instead of the
   * harness defaults), `accessLevel` (wins over the server's annotations), `output` (as in `output`).
   */
  tools?: Record<string, McpToolSettings>;
  /** Expected resource URIs / URI templates and prompt names (cataloged before the first sync). */
  resources?: string[];
  prompts?: string[];
  /** Import only the declared tools (resources, prompts) of this server. */
  strict?: boolean;
}

export interface McpToolSettings {
  roles?: string[];
  accessLevel?: AccessLevel;
  description?: string;
  output?: { llm?: FormatSpec; display?: FormatSpec };
}

/** Default env var of an IdP's client id, for hints when sign-in is unavailable. */
const CLIENT_ID_ENV: Record<string, string> = { [GOOGLE_IDP]: 'CLIENT_ID_BLUEPRINT' };

export interface BlueprintConfig {
  /** Gemini LLM; without `apiKey` the plugin falls back to GOOGLE_API_KEY / GEMINI_API_KEY. */
  gemini: { apiKey?: string; model?: string };
  /**
   * Web assistant agent: `historyCompaction` = history_compaction strategy (empty string = none);
   * `summaryModel` = model of the history_summarizer agent (default: the assistant's).
   */
  assistant: { historyCompaction?: string; summaryModel?: string };
  dataDir: string;
  databasePath?: string;
  server: { port: number };
  mcp: Record<string, McpServerSettings>;
  auth: Record<string, IdpConfig>;
}

export interface LoadedBlueprintConfig {
  config: BlueprintConfig;
  /** The `host:` section, spread into `createCuratorHost`. */
  host: AppHostSettings;
  activeProfiles: string[];
  sources: string[];
}

/** Built-in defaults; `blueprint.config.yaml` documents the same values. */
const DEFAULTS: BlueprintConfig = {
  gemini: { apiKey: '${GOOGLE_API_KEY}' },
  assistant: { historyCompaction: 'pack-middle:head=1,keep=6,max=16,agent=history_summarizer' },
  dataDir: './data',
  server: { port: 4100 },
  mcp: {
    [BLUEPRINT_SERVICE]: {
      url: 'http://127.0.0.1:4200/mcp',
      idp: GOOGLE_IDP,
      bearer: 'id_token',
      // Granted (harness default roles) and cataloged before the server is reached.
      tools: { web_scrape: { accessLevel: 'read_only' } },
    },
  },
  auth: {
    // "TVs and Limited Input devices" client: device flow, scopes `openid email`.
    [GOOGLE_IDP]: {
      issuer: 'https://accounts.google.com',
      flow: 'device',
      scope: 'openid email',
      audienceParam: 'none',
      clientId: '${CLIENT_ID_BLUEPRINT}',
      clientSecret: '${CLIENT_SECRET_BLUEPRINT}',
    },
  },
};

/** Where `.env` files are looked up: cwd, the blueprint root, then the workspace root. */
const ENV_DIRS = [process.cwd(), BLUEPRINT_ROOT, path.resolve(BLUEPRINT_ROOT, '../..')];

/**
 * Layered blueprint config: defaults, `blueprint.config.*`, `blueprint.config.<profile>.*`, then env overrides
 * (`BLUEPRINT_MODEL`, `DATA_DIR`, `CURATOR_DATABASE_PATH`, `PORT`, `BLUEPRINT_MCP_URL`).
 * Profiles: `--profile`, `BLUEPRINT_PROFILES`, `CURATOR_PROFILES`, then `profiles.active`.
 * `.env` / `.env.<profile>` files fill the environment first and never override variables already set.
 */
export function loadBlueprintConfig(env: NodeJS.ProcessEnv = process.env): LoadedBlueprintConfig {
  const app = loadAppConfig<Partial<BlueprintConfig>>({
    appId: BLUEPRINT_APP_ID,
    profiles: profilesFromArgv(),
    configPath: env.BLUEPRINT_CONFIG || undefined,
    searchDirs: [process.cwd(), BLUEPRINT_ROOT],
    envDirs: ENV_DIRS,
    env,
  });
  const config = mergeConfig<BlueprintConfig>(resolvePlaceholders(DEFAULTS, env), app.values);

  if (env.BLUEPRINT_MODEL) config.gemini.model = env.BLUEPRINT_MODEL;
  if (env.DATA_DIR) config.dataDir = env.DATA_DIR;
  if (env.CURATOR_DATABASE_PATH) config.databasePath = env.CURATOR_DATABASE_PATH;
  if (env.PORT) config.server.port = Number(env.PORT);
  if (env.BLUEPRINT_MCP_URL && config.mcp[BLUEPRINT_SERVICE]) config.mcp[BLUEPRINT_SERVICE].url = env.BLUEPRINT_MCP_URL;

  return { config, host: app.host, activeProfiles: app.activeProfiles, sources: app.sources };
}

/** Config `mcp.<server>.output` as tool output rules for the `mcp.<server>.<tool>` aliases. */
export function mcpToolOutputRules(config: BlueprintConfig): Record<string, { llm?: FormatSpec; display?: FormatSpec }> {
  const rules: Record<string, { llm?: FormatSpec; display?: FormatSpec }> = {};
  for (const [name, server] of enabledMcpServers(config)) {
    for (const [tool, spec] of Object.entries(server.tools ?? {})) if (spec?.output) rules[`mcp.${name}.${tool}`] = spec.output;
    for (const [tool, spec] of Object.entries(server.output ?? {})) rules[`mcp.${name}.${tool}`] = spec;
  }
  return rules;
}

/**
 * What `register` should create before the server is reached (`tools`, `resources`, `prompts`, `strict`);
 * null clears declarations stored by an earlier config.
 */
export function mcpExpectations(server: McpServerSettings): McpServerExpectations | null {
  if (!server.tools && !server.resources && !server.prompts) return null;
  const tools = Object.fromEntries(
    Object.entries(server.tools ?? {}).map(([name, t]) => [name, { roles: t?.roles, accessLevel: t?.accessLevel, description: t?.description }])
  );
  return { tools, resources: server.resources, prompts: server.prompts, strict: server.strict };
}

/** Enabled MCP servers by name. */
export function enabledMcpServers(config: BlueprintConfig): Array<[string, McpServerSettings]> {
  return Object.entries(config.mcp).filter(([, server]) => server && server.enabled !== false);
}

/** What to set for an IdP's client id (for hints when sign-in is unavailable). */
export function idpClientIdHint(idp: string): string {
  return CLIENT_ID_ENV[idp] || `auth.${idp}.clientId`;
}

/**
 * Sign-in config for the harness: each IdP with a client id, and an auth service per MCP server that names one.
 * Google id_tokens go out as bearer; the blueprint server verifies them against Google's JWKS.
 * Returns null when no IdP has a client id.
 */
export function harnessAuthConfig(config: BlueprintConfig): AuthConfig | null {
  const idps: Record<string, IdpConfig> = {};
  for (const [name, idp] of Object.entries(config.auth)) {
    if (idp?.clientId) idps[name] = idp;
  }
  if (!Object.keys(idps).length) return null;

  const services: AuthConfig['services'] = {};
  for (const [name, server] of enabledMcpServers(config)) {
    if (server.idp && idps[server.idp]) {
      services[name] = { url: server.url, kind: 'mcp', idp: server.idp, bearer: server.bearer };
    }
  }
  return { idps, services };
}
