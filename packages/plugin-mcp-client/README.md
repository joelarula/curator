# @curator/plugin-mcp-client

Remote MCP providers for Curator, registered per project and stored in the core model:

| Table | Holds |
|---|---|
| `McpServer` | provider registry, unique per `(projectId, name)`: url, auth service, status, server info |
| `Tool` (`origin='remote'`) | one row per remote tool; `name` = `mcp.<server>.<tool>@<projectId>`, plus `remoteName`, `inputSchema`, `annotations` |
| `McpResource` | resources and URI templates (`isTemplate`) per server |
| `McpPrompt` | prompts and their arguments per server |

Workflows call remote tools as `mcp.<server>.<tool>`; the engine resolves the alias in the request's
project first, then in shared projects (`sharedProjectIds`, default `['system']`). RBAC, approvals and
permissions use the qualified key, so remote tools are gated exactly like local ones. A remote tool
refuses requests from another project even when called by its qualified key.

## Wiring

```ts
import { curatorEngine } from '@curator/agent-server';
import { createCuratorHost } from '@curator/host';
import { AuthSessionManager } from '@curator/auth-client';
import { createMcpClientPlugin } from '@curator/plugin-mcp-client';

const auth = await AuthSessionManager.fromConfigFile();
const { plugin, registry } = createMcpClientPlugin({ auth });
const host = await createCuratorHost({
  /* ... */
  registerPlugins: () => (curatorEngine.registerPlugin(plugin), curatorEngine),
});
await registry.attach(host); // restores servers/tools from the database, no network

await registry.register({ projectId: 'p1', name: 'crm', url: 'https://crm.corp/mcp', authService: 'crm' });
await host.runTool('mcp.crm.lookup', { q: 'acme' });
```

## Agents

`Curator_Agent.tools` accepts keys, aliases and `*` patterns, resolved in the request's project:

```ts
{ type: 'Curator_Agent', agentName: 'assistant', provider: 'gemini', tools: ['mcp.google.*', 'mcp_resource_read'] }
```

The model sees provider-safe names (`mcp__google__search_gmail`; valid local names are unchanged). Access
checks, approvals and `pendingToolCall.name` use the project-qualified key; `pendingToolCall.llmName` is the
name the model called.

## Local tools (for workflows and the REPL)

| Tool | Access | |
|---|---|---|
| `mcp_servers_list` | read_only | servers visible to the project, status, tool aliases |
| `mcp_server_register` `{name, url, authService?}` | elevated | add/update a server and sync it (approval-gated) |
| `mcp_server_sync` `{name}` | safe_write | re-sync the catalog (role `mcp_connector`, a default user role) |
| `mcp_server_connect` `{name}` | safe_write | one connection attempt, outcome as data (role `mcp_connector`; used by `mcp_connect`) |
| `mcp_server_unregister` `{name}` | destructive | soft-remove; tools stop resolving |
| `mcp_resources_list` `{server?}` / `mcp_prompts_list` `{server?}` | read_only | catalog from the database |
| `mcp_resource_read` `{server, uri}` / `mcp_prompt_get` `{server, name, arguments?}` | read_only | live reads |

The project always comes from the request (session / `x-project-id`), never from tool arguments.

## Keeping servers connected

A server that is down must not hold anyone up. Register it without syncing and start its connector flow:

```ts
const reconciler = new McpReconciler(registry, host); // after host.seed() and registry.attach(host)
await registry.register({ projectId: host.project.id, name: 'crm', url: 'https://crm.corp/mcp', authService: 'crm', sync: false });
await reconciler.watch('crm'); // no-op when a flow for 'crm' is still running (e.g. from before a restart)
```

The flow is the `mcp_connect` script (`connectorWorkflow`, a `Curator_Graph`), one per server, run as the host user
(role `mcp_connector`, a default user role) in the host's project. Every step is a Request:

| State | Body | Next |
|---|---|---|
| `sync` | `mcp_server_connect` → `connected` / `auth_required` / `error` (+ `retryInSeconds`) / `gone` | by status; `gone` ends the flow |
| `backoff` | wait `mcp:<server>:retry`, timeout `retryInSeconds` (5s doubling to 5 min, option `retry`) | `sync` |
| `login` | wait `auth:login` or `mcp:<server>:retry` | `sync` |
| `connected` | wait `mcp:<server>:disconnected` or `mcp:<server>:retry` | `sync` |

- Waits are persisted, so backoff and waiting for a sign-in survive restarts.
- `reconciler.retry(name)` emits `mcp:<server>:retry`; the reconciler emits `mcp:<server>:disconnected` when a connected server fails outside a sync (e.g. a remote tool call cannot reach it).
- Each attempt broadcasts `mcp:status` (`McpConnectResult`: `{server, projectId, status, error?, tools?, retryInSeconds?}`); `registry.onStatus` reports every status change in process.

## Sign-in as a flow

`createAuthPlugin(auth)` adds `auth_login_start` / `auth_login_cancel` (role `auth_signin`, a default user role) and the
`auth_login` script. A login runs in the host's process and reports through host events: `auth:verification` (device
link and code), `auth:authorization`, `auth:status`, then `auth:<target>:done` and `auth:login` (or `auth:failed`).
`createHostAuthManager(auth, host)` is a shell auth manager (`/auth`) whose `login` runs that flow, so connector flows
waiting in `login` resume when the user signs in.

```ts
const signIn = createAuthPlugin(auth); // register signIn.plugin with the engine, then:
signIn.attach(host);
const shellAuth = createHostAuthManager(auth, host);
```

## Behaviour

- **Sync** pages through `tools/list`, `resources/list`, `resources/templates/list`, `prompts/list`; items a server no longer offers become `existent=false` and their tools are unregistered. `list_changed` notifications trigger a debounced resync.
- **Access level** is set once, when the Tool row is created, from annotations (`readOnlyHint` → `read_only`, `destructiveHint:true` → `destructive`, `destructiveHint:false` → `safe_write`, otherwise `unannotatedAccessLevel`, default `elevated`). Annotations are untrusted hints; after creation the level belongs to the admin and resync does not change it.
- **Auth**: a server with `authService` gets tokens from that `@curator/auth-client` service (added with the server URL, IdP discovered, if not in `auth.json`). Missing/rejected tokens set status `auth_required`, broadcast `auth:required` `{service, server, projectId}` (the REPL shows `/auth login <service>`), and fail with `code: 'AUTH_REQUIRED'`.
- **Permissions**: on databases with a `Permission` table, `tool:<key>:execute` is granted to `Admin` (and `AgentWorker` for read_only/safe_write), mirroring the processor's seeding.
- Remote tools are never re-exposed on Curator's own MCP server.

Tokens live in the process that runs the host: register remote servers in a host running next to the user's auth sessions (embedded/console). A remote Curator server cannot use the console's tokens.

Build: `npm --prefix packages/plugin-mcp-client run build` · Test: `npm --prefix packages/plugin-mcp-client test`
