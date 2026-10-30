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
| `mcp_server_sync` `{name}` | safe_write | re-sync the catalog |
| `mcp_server_unregister` `{name}` | destructive | soft-remove; tools stop resolving |
| `mcp_resources_list` `{server?}` / `mcp_prompts_list` `{server?}` | read_only | catalog from the database |
| `mcp_resource_read` `{server, uri}` / `mcp_prompt_get` `{server, name, arguments?}` | read_only | live reads |

The project always comes from the request (session / `x-project-id`), never from tool arguments.

## Behaviour

- **Sync** pages through `tools/list`, `resources/list`, `resources/templates/list`, `prompts/list`; items a server no longer offers become `existent=false` and their tools are unregistered. `list_changed` notifications trigger a debounced resync.
- **Access level** is set once, when the Tool row is created, from annotations (`readOnlyHint` → `read_only`, `destructiveHint:true` → `destructive`, `destructiveHint:false` → `safe_write`, otherwise `unannotatedAccessLevel`, default `elevated`). Annotations are untrusted hints; after creation the level belongs to the admin and resync does not change it.
- **Auth**: a server with `authService` gets tokens from that `@curator/auth-client` service (added with the server URL, IdP discovered, if not in `auth.json`). Missing/rejected tokens set status `auth_required`, broadcast `auth:required` `{service, server, projectId}` (the REPL shows `/auth login <service>`), and fail with `code: 'AUTH_REQUIRED'`.
- **Permissions**: on databases with a `Permission` table, `tool:<key>:execute` is granted to `Admin` (and `AgentWorker` for read_only/safe_write), mirroring the processor's seeding.
- Remote tools are never re-exposed on Curator's own MCP server.

Tokens live in the process that runs the host: register remote servers in a host running next to the user's auth sessions (embedded/console). A remote Curator server cannot use the console's tokens.

Build: `npm --prefix packages/plugin-mcp-client run build` · Test: `npm --prefix packages/plugin-mcp-client test`
