import { createCuratorHost, resolveClientIdentity, type CuratorHost } from '@curator/host';
import { curatorEngine } from '../../../curator/dist/src/index.js';
import { AuthSessionManager } from '../../../packages/auth-client/dist/index.js';
import { geminiPlugin } from '../../../packages/plugin-llm-gemini/dist/index.js';
import {
  McpReconciler,
  createAuthPlugin,
  createHostAuthManager,
  createMcpClientPlugin,
  type McpRemoteRegistry,
  type RegisterMcpServerResult,
} from '../../../packages/plugin-mcp-client/dist/index.js';
import { BLUEPRINT_USER_ROLE, demoPlugin } from './plugins/demo.js';
import { ASSISTANT_ROLE, assistantPlugin } from './harness/assistantPlugin.js';
import {
  BLUEPRINT_SERVICE,
  enabledMcpServers,
  harnessAuthConfig,
  idpClientIdHint,
  loadBlueprintConfig,
  mcpExpectations,
  mcpToolOutputRules,
  type BlueprintConfig,
} from './harness/env.js';

export interface BlueprintRuntime {
  host: CuratorHost;
  /** Remote MCP providers of this host (the blueprint server among them). */
  registry: McpRemoteRegistry;
  /** Starts the connector flows that keep the configured MCP servers connected (`mcp:status` events). */
  reconciler: McpReconciler;
  /** Google sign-in sessions (null when CLIENT_ID_BLUEPRINT is not configured). */
  auth: AuthSessionManager | null;
  /** The sessions for `/auth`, with logins running as the host's `auth_login` flow (null without `auth`). */
  shellAuth: ReturnType<typeof createHostAuthManager> | null;
  /** Effective config (defaults, `blueprint.config.*` with active profiles, env overrides). */
  config: BlueprintConfig;
  activeProfiles: string[];
}

export interface BlueprintRuntimeOptions {
  auth?: AuthSessionManager | null;
  databasePath?: string;
  /**
   * Run the host as the person using the client (REPL): the Google sign-in identity, else the stored
   * `blueprint` identity, else a prompt. Without it the host runs as the system user.
   */
  actor?: { displayName?: string; interactive?: boolean };
}

/** The user the host acts as: id/name from the client identity, the e-mail of the sign-in when there is one. */
async function resolveActor(
  config: BlueprintConfig,
  auth: AuthSessionManager | null,
  options: NonNullable<BlueprintRuntimeOptions['actor']>
): Promise<{ userId: string; userName: string; userEmail: string }> {
  const idp = enabledMcpServers(config).map(([, server]) => server.idp).find(Boolean);
  const identity = await resolveClientIdentity({
    appId: 'blueprint',
    displayName: options.displayName,
    auth: auth as any,
    authTarget: idp,
    interactive: options.interactive,
    fallbackName: 'User',
  });
  const signedIn = identity.source === 'auth' && auth && idp ? await auth.whoami(idp).catch(() => null) : null;
  return { userId: identity.userId, userName: identity.displayName, userEmail: signedIn?.email || `${identity.userId}@local` };
}

/**
 * The blueprint harness host: demo tools, Gemini, remote MCP tools and the web assistant agent.
 * Google sign-in tokens live in this process (FileTokenStore, ~/.curator/credentials).
 */
export async function createBlueprintRuntime(options: BlueprintRuntimeOptions = {}): Promise<BlueprintRuntime> {
  const { config, host: hostSettings, activeProfiles } = loadBlueprintConfig();
  const authConfig = harnessAuthConfig(config);
  const auth = options.auth !== undefined ? options.auth : authConfig ? new AuthSessionManager({ config: authConfig }) : null;
  // Discovered remote tools go to the assistant and to every blueprint user (the common user role).
  const { plugin: mcpClient, registry } = createMcpClientPlugin({
    auth: auth ?? undefined,
    toolRoles: [ASSISTANT_ROLE, BLUEPRINT_USER_ROLE],
  });
  const signIn = auth ? createAuthPlugin(auth) : null;
  const { apiKey, model } = config.gemini;
  const actor = options.actor ? await resolveActor(config, auth, options.actor) : {};

  const host = await createCuratorHost({
    intervalMs: 3000,
    // `host:` section of the config files (log level, retention, ...); explicit options below win
    ...hostSettings,
    ...actor,
    name: 'blueprint',
    dataDir: config.dataDir,
    curatorDb: {
      path: options.databasePath ?? config.databasePath,
    },
    registerPlugins: async () => {
      curatorEngine.registerPlugin(demoPlugin);
      curatorEngine.registerPlugin(geminiPlugin({ apiKey, defaultModel: model }) as any);
      curatorEngine.registerPlugin(mcpClient);
      if (signIn) curatorEngine.registerPlugin(signIn.plugin);
      curatorEngine.registerPlugin(assistantPlugin({ model, historyCompaction: config.assistant.historyCompaction, summaryModel: config.assistant.summaryModel }));
      // Registered last: configured tool output rules win over the plugins' defaults.
      curatorEngine.registerPlugin({ name: 'blueprint-config-output', toolOutput: mcpToolOutputRules(config) });
      return curatorEngine;
    },
  });
  // Roles, the assistant agent and its role link must exist before remote tools are granted to it.
  await host.seed();
  await registry.attach(host);
  signIn?.attach(host);
  const reconciler = new McpReconciler(registry, host);
  const shellAuth = auth ? createHostAuthManager(auth, host) : null;
  return { host, registry, reconciler, auth, shellAuth, config, activeProfiles };
}

export async function createBlueprintHost(): Promise<CuratorHost> {
  return (await createBlueprintRuntime()).host;
}

/**
 * Registers (or refreshes) a configured MCP server in the host's project and syncs its tools.
 * Without a session for its IdP the result carries `error.code === 'AUTH_REQUIRED'` and an
 * `auth:required` event is broadcast, which the REPL turns into a device-flow login.
 */
export function connectMcpServer(runtime: BlueprintRuntime, name: string): Promise<RegisterMcpServerResult> {
  const server = runtime.config.mcp[name];
  if (!server) throw new Error(`MCP server "${name}" is not configured`);
  return runtime.registry.register({
    projectId: runtime.host.project.id,
    name,
    url: server.url,
    authService: server.idp ? name : null,
    expect: mcpExpectations(server),
  });
}

export function connectBlueprintServer(runtime: BlueprintRuntime): Promise<RegisterMcpServerResult> {
  return connectMcpServer(runtime, BLUEPRINT_SERVICE);
}

/**
 * Registers every configured MCP server and starts its connector flow (unless one is still running from an
 * earlier session): nothing waits on a server, one that is down is retried with backoff, one that needs
 * sign-in connects after the `auth:login` event. Needs a started host (the processor runs the flows).
 * Returns the servers left out because their IdP has no client id, with what to set.
 */
export async function startMcpServers(runtime: BlueprintRuntime): Promise<{ server: string; missing: string }[]> {
  const skipped: { server: string; missing: string }[] = [];
  const projectId = runtime.host.project.id;
  for (const [name, server] of enabledMcpServers(runtime.config)) {
    if (server.idp && !runtime.auth?.serviceNames().includes(name)) {
      skipped.push({ server: name, missing: idpClientIdHint(server.idp) });
      continue;
    }
    await runtime.registry.register({
      projectId,
      name,
      url: server.url,
      authService: server.idp ? name : null,
      expect: mcpExpectations(server),
      sync: false,
    });
    await runtime.reconciler.watch(name);
  }
  return skipped;
}

/** Names of the enabled MCP servers in the runtime's config. */
export function mcpServerNames(runtime: BlueprintRuntime): string[] {
  return enabledMcpServers(runtime.config).map(([name]) => name);
}
