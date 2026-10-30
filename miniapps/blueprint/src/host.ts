import { createCuratorHost, type CuratorHost } from '../../../packages/host/dist/index.js';
import { curatorEngine } from '../../../curator/dist/src/index.js';
import { AuthSessionManager } from '../../../packages/auth-client/dist/index.js';
import { geminiPlugin } from '../../../packages/plugin-llm-gemini/dist/index.js';
import {
  createMcpClientPlugin,
  type McpRemoteRegistry,
  type RegisterMcpServerResult,
} from '../../../packages/plugin-mcp-client/dist/index.js';
import { demoPlugin } from './plugins/demo.js';
import { ASSISTANT_ROLE, assistantPlugin } from './harness/assistantPlugin.js';
import { BLUEPRINT_SERVICE, blueprintMcpUrl, harnessAuthConfig, loadBlueprintEnv } from './harness/env.js';

export interface BlueprintRuntime {
  host: CuratorHost;
  /** Remote MCP providers of this host (the blueprint server among them). */
  registry: McpRemoteRegistry;
  /** Google sign-in sessions (null when CLIENT_ID_BLUEPRINT is not configured). */
  auth: AuthSessionManager | null;
}

export interface BlueprintRuntimeOptions {
  auth?: AuthSessionManager | null;
  databasePath?: string;
}

/**
 * The blueprint harness host: demo tools, Gemini, remote MCP tools and the web assistant agent.
 * Google sign-in tokens live in this process (FileTokenStore, ~/.curator/credentials).
 */
export async function createBlueprintRuntime(options: BlueprintRuntimeOptions = {}): Promise<BlueprintRuntime> {
  loadBlueprintEnv();
  const authConfig = harnessAuthConfig();
  const auth = options.auth !== undefined ? options.auth : authConfig ? new AuthSessionManager({ config: authConfig }) : null;
  const { plugin: mcpClient, registry } = createMcpClientPlugin({ auth: auth ?? undefined, toolRoles: [ASSISTANT_ROLE] });
  const model = process.env.BLUEPRINT_MODEL || undefined;

  const host = await createCuratorHost({
    name: 'blueprint',
    dataDir: process.env.DATA_DIR ?? './data',
    curatorDb: {
      path: options.databasePath ?? process.env.CURATOR_DATABASE_PATH,
    },
    intervalMs: 3000,
    registerPlugins: async () => {
      curatorEngine.registerPlugin(demoPlugin);
      curatorEngine.registerPlugin(geminiPlugin({ defaultModel: model }) as any);
      curatorEngine.registerPlugin(mcpClient);
      curatorEngine.registerPlugin(assistantPlugin({ model }));
      return curatorEngine;
    },
  });
  // Roles, the assistant agent and its role link must exist before remote tools are granted to it.
  await host.seed();
  await registry.attach(host);
  return { host, registry, auth };
}

export async function createBlueprintHost(): Promise<CuratorHost> {
  return (await createBlueprintRuntime()).host;
}

/**
 * Registers (or refreshes) the blueprint server in the host's project and syncs its tools.
 * Without a Google session the result carries `error.code === 'AUTH_REQUIRED'` and an
 * `auth:required` event is broadcast, which the REPL turns into a device-flow login.
 */
export function connectBlueprintServer(runtime: BlueprintRuntime): Promise<RegisterMcpServerResult> {
  return runtime.registry.register({
    projectId: runtime.host.project.id,
    name: BLUEPRINT_SERVICE,
    url: blueprintMcpUrl(),
    authService: BLUEPRINT_SERVICE,
  });
}
