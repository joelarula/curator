# Curator Host Development Plan

Summary of work required in the **curator** repo (`@curator/host`) to enable seamless **facilitator** integration. Facilitator depends on this package; implementation lives in `curator/packages/host/`.

## Goal

Replace per-miniapp copy-paste (e.g. Keeris `curator-runtime.ts`, `setup-curator.ts`) with a single host runtime that:

- Provisions the Curator orchestration database
- Registers domain plugins and holds the engine (`tools`, `agents`)
- Starts `CuratorRequestProcessor` polling
- Exposes `triggerAgent`, pause/resume, seed, and an event bus
- Integrates with `@curator/console` and GraphQL (later packages)

Facilitator provides domain plugins (Jira, Bitbucket, git, opencode), domain Prisma schema, and Vue UI. Host handles orchestration lifecycle only.

## What stays out of `@curator/host` (phase 1)

| Concern | Owner | Task |
|---------|-------|------|
| Filesystem layout (`repos/`, `worktrees/`, `artifacts/`) | `@curator/paths` or facilitator `src/paths.ts` | CUR-005 |
| Artifact read/write + DB sync | `@curator/artifacts` | CUR-009 |
| MCP server | `@curator/mcp-server` | CUR-006+ |
| GraphQL schema | `@curator/graphql-host` | CUR-010+ |
| Jira, Bitbucket, opencode prompts | facilitator | — |

**`@curator/host` does not include `CuratorPathsApi` in phase 1.** Only `dataDir` is passed in; default curator DB path is `{dataDir}/state/curator.db` (inline `path.join` in CUR-002).

## Reference code (curator repo)

| File | Purpose |
|------|---------|
| `miniapps/keeris/src/curator-runtime.ts` | Port runtime bootstrap |
| `miniapps/keeris/src/setup-curator.ts` | Port tool/agent seeding |
| `miniapps/keeris/src/server/events.ts` | Port event bus |
| `curator/` (`@curator/agent-server`) | Engine, processor, provisioners |
| `packages/adapter-sqlite`, `adapter-mariadb` | DB adapters |

## Package layout

```text
curator/packages/host/
├── package.json          # name: @curator/host
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts
    ├── createCuratorHost.ts
    ├── types.ts
    ├── events/
    │   └── CuratorHostEvents.ts
    ├── seed/
    │   └── seedAgentsAndTools.ts
    └── bin/
        └── curator-seed.ts
```

Workspace: auto-registered via `curator/package.json` workspaces `packages/*`.

Facilitator dependency (when scaffolded):

```json
"@curator/host": "file:../curator/packages/host"
```

## Public API (target)

```typescript
import { createCuratorHost } from '@curator/host';

const host = await createCuratorHost({
  name: 'facilitator',
  dataDir: process.env.DATA_DIR ?? './data',
  curatorDb: { path: undefined },  // default: {dataDir}/state/curator.db
  registerPlugins: async (ctx) => {
    // ctx.dataDir, ctx.domainDb — no paths helper in phase 1
    return registerFacilitatorPlugins(ctx);
  },
});

await host.start();
await host.seed();

const { requestId } = await host.triggerAgent('implement_issue', { jiraKey: 'POMS-123' });
await host.stop();
```

### `CuratorHost` surface

| Member | Phase |
|--------|-------|
| `config`, `events`, `prisma`, `processor`, `engine` | CUR-002 |
| `start()`, `stop()`, `gracefulShutdown()` | CUR-002, CUR-020 |
| `triggerAgent()`, `pauseRequest()`, `resumeRequest()` | CUR-002 |
| `seed()` | CUR-003 |

### `PluginRegistrationContext` (phase 1)

```typescript
interface PluginRegistrationContext {
  dataDir: string;
  domainDb?: unknown;  // facilitator Prisma / sqlite handle
}
```

## Task breakdown

### CUR-001 — Scaffold (P0)

Create package with types, stubs, and working `CuratorHostEvents` bus.

- **Implement:** `createCuratorHost()` stub, `CuratorHostEvents`, type exports, `seedAgentsAndTools` stub, `curator-seed` CLI stub
- **Do not implement:** DB provision, processor, paths module
- **Acceptance:** `npm run build` in package succeeds; `start()` / `seed()` throw clear not-implemented errors

### CUR-002 — Runtime (P0)

Port logic from Keeris `curator-runtime.ts`.

- Provision SQLite or MariaDB curator DB
- Upsert system user + project (name from `config.name`)
- Call `registerPlugins({ dataDir, domainDb })`
- Start `CuratorRequestProcessor` with `onEvent` → `host.events.broadcast`
- Implement `triggerAgent`, `stop()`
- Optional: `auth.seedRbac` via `@curator/plugin-auth`

### CUR-003 — Seed (P0)

Port logic from Keeris `setup-curator.ts`.

- Idempotent upsert: `engine.tools` → `Tool`, `engine.agents` → `Script` + `Agent`
- New agents default `enabled: false`
- `host.seed()` and `npx curator-seed --data-dir <path>`

### CUR-004 — Events polish (P0)

- Typed event enum, `*` wildcard subscriber
- Document payload shape (`requestId`, etc.)
- Wire to GraphQL SSE in `@curator/graphql-host` (CUR-011)

### CUR-005 — Paths (P1, separate package)

`@curator/paths` — **not** part of host.

- `createCuratorPaths(dataDir)` for `repos/`, `worktrees/`, `artifacts/`, etc.
- Used by facilitator, `@curator/artifacts`, MCP tools

## Dependency graph

```text
CUR-001 @curator/host scaffold
  → CUR-002 runtime
  → CUR-003 seed
  → CUR-004 events

CUR-005 @curator/paths     (parallel, not a host dependency)
  → CUR-009 @curator/artifacts
  → CUR-007 MCP read_artifact

CUR-006 @curator/mcp-server
CUR-010 @curator/graphql-host
CUR-012 createConsoleAdapter
```

## Suggested PR order (curator repo)

| PR | Tasks |
|----|-------|
| PR1 | CUR-001, CUR-002, CUR-003, CUR-004 |
| PR2 | CUR-005, CUR-009 |
| PR3 | CUR-006, CUR-007, CUR-008 |
| PR4 | CUR-010, CUR-011, CUR-012 |

## Facilitator integration (after host is ready)

1. Add `@curator/host` dependency
2. `src/host.ts` — `createCuratorHost` + `registerFacilitatorPlugins`
3. `src/setup.ts` — call `host.seed()` on deploy
4. `src/server/index.ts` — start host alongside Express/GraphQL
5. Local `src/paths.ts` until CUR-005 ships (or depend on `@curator/paths`)

## Definition of done

Facilitator can:

1. `npm install @curator/host` (file/workspace link)
2. Boot host with domain plugins in ~20 lines
3. Seed tools/agents idempotently
4. Trigger agents and observe requests via Console (after graphql-host PR)
5. Own all filesystem conventions separately until `@curator/paths` exists

## Related docs

- [Curator MCP Server (P1)](./curator-mcp-server.md) — plugin-driven MCP tool exposure (CUR-006+)
- [Curator Opencode Integration (P2)](./curator-opencode-integration.md) — harness client, HarnessGate AST, workflows (CUR-013+)
- Curator hardening: `curator/curator/CORE_HARDENING_PLAN.md` (leases, AST validation — parallel track CUR-019/020)
- Miniapp patterns: `curator/.agents/skills/curator-miniapp/SKILL.md`
- Autodev reference: `autodev/autodev-stack.yml`, `autodev/autodev/src/`


# Curator MCP Server — P1 Development Plan

Detailed task descriptions for **`@curator/mcp-server`** in the curator repo. Goal: external agents (opencode, Claude Desktop, etc.) call Curator capabilities via MCP, with **tool listings driven by the same plugin registry as the engine** — no hardcoded tool switch statements.

**Depends on:** CUR-002 (`@curator/host` runtime with `host.engine` + `host.prisma`)  
**Consumer:** facilitator opencode harness (`mcp.json` → stdio), future miniapps

---

## Design principle: plugin-driven MCP

Today `server/src/mcp-server.ts` hardcodes tool names in `ListToolsRequestSchema` and a `switch (name)` in `CallToolRequestSchema`. That breaks when facilitator registers `jira_pickup`, `bitbucket_comment`, etc.

**Target flow:**

```text
facilitator registerPlugins()
  → curatorEngine.registerPlugin(facilitatorPlugin)   // tools in engine.tools Map
  → createMcpServer({ host })
  → list_tools reads engine.tools (+ mcp exposure metadata)
  → call_tool dispatches to CuratorTool.runAsync()
```

Register a tool in a Curator plugin → it appears in MCP automatically (when exposure rules allow). No second registration list.

**Symmetric with existing MCP client plugin:** `curator/src/plugins/mcp/index.ts` (`createMcpPlugin`) already maps **external MCP → Curator tools**. This work adds **Curator tools → MCP server** (inverse direction).

---

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│  facilitator plugins (jira, bitbucket, git, opencode)   │
│  defineTool({ name, mcp: { expose: true }, ... })       │
└──────────────────────────┬──────────────────────────────┘
                           │ registerPlugin()
┌──────────────────────────▼──────────────────────────────┐
│  CuratorEngine.tools  (Map<string, CuratorTool>)        │
└──────────────────────────┬──────────────────────────────┘
                           │ McpToolRegistry.fromEngine()
┌──────────────────────────▼──────────────────────────────┐
│  @curator/mcp-server                                     │
│  list_tools  →  tool.toMcpDeclaration()                │
│  call_tool   →  tool.runAsync({ args, toolContext })     │
└──────────────────────────┬──────────────────────────────┘
                           │ stdio / HTTP
┌──────────────────────────▼──────────────────────────────┐
│  opencode / external agent                               │
└─────────────────────────────────────────────────────────┘
```

**Core/system tools** (`execute_script`, `search_knowledge`, …) are also Curator plugins — not literals in `mcp-server.ts`.

---

## Package layout

```text
curator/packages/mcp-server/
├── package.json              # name: @curator/mcp-server
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts
    ├── createMcpServer.ts    # factory + transport wiring
    ├── McpToolRegistry.ts    # builds MCP view from CuratorEngine
    ├── types.ts
    ├── context/
    │   └── buildToolContext.ts   # prisma, userId, host refs for runAsync
    ├── plugins/
    │   ├── index.ts
    │   ├── mcp-core-plugin.ts        # knowledge + script tools (ported)
    │   └── mcp-orchestration-plugin.ts  # trigger_agent, get_request, ...
    └── bin/
        └── curator-mcp.ts    # stdio entry: load host config or connect to running host
```

**Port source:** `server/src/mcp-server.ts`, `server/src/services/tools/executeScript.ts`, knowledge query logic inline in mcp-server.

---

## Engine changes (small, in `@curator/agent-server`)

These belong in **CUR-006a** (can be same PR as scaffold or prerequisite).

### Extend `CuratorTool` / `defineTool`

Add optional MCP metadata on every tool:

```typescript
// curator/src/tools/CuratorTool.ts

export interface McpToolExposure {
  /** Expose this tool on the MCP server. Default: false */
  expose?: boolean;
  /** Override MCP tool name (default: tool.name) */
  name?: string;
  /** Override MCP description */
  description?: string;
}

export interface CuratorTool {
  // ...existing fields...
  readonly mcp?: McpToolExposure;

  /** MCP ListTools entry */
  toMcpDeclaration(): {
    name: string;
    description: string;
    inputSchema: CuratorJsonSchema;
  };
}

export function defineTool(opts: {
  // ...existing...
  mcp?: McpToolExposure;
}): CuratorTool
```

`toMcpDeclaration()` implementation:

```typescript
toMcpDeclaration() {
  return {
    name: opts.mcp?.name ?? opts.name,
    description: opts.mcp?.description ?? opts.description,
    inputSchema: opts.parameters ?? { type: 'object', properties: {} },
  };
}
```

### Extend `CuratorPluginDefinition`

Plugin-level defaults so facilitators don't annotate every tool:

```typescript
export interface CuratorPluginMcpPolicy {
  /** Expose all tools from this plugin on MCP (overrides per-tool default) */
  exposeAll?: boolean;
  /** Only expose these tool keys */
  include?: string[];
  /** Never expose these tool keys */
  exclude?: string[];
}

export interface CuratorPluginDefinition {
  // ...existing...
  mcp?: CuratorPluginMcpPolicy;
}
```

### Exposure resolution (`McpToolRegistry`)

For each `[key, tool]` in `engine.tools`:

1. Find registering plugin (track on `registerPlugin` — add `tool._pluginName` or reverse map).
2. Apply plugin `mcp.exclude` → skip.
3. Apply plugin `mcp.include` → only listed.
4. Apply plugin `mcp.exposeAll` → expose unless excluded.
5. Else use `tool.mcp?.expose === true`.
6. **Default: not exposed** (safe — internal AST tools stay hidden).

### Track tool → plugin provenance

In `CuratorEngine.registerPlugin`:

```typescript
Object.entries(plugin.tools).forEach(([k, v]) => {
  this.tools.set(k, v);
  this.toolPlugins.set(k, plugin.name);  // NEW map
});
```

---

## Task breakdown

### CUR-006 — Extract `@curator/mcp-server` scaffold

**Goal:** Package exists; `createMcpServer()` wires MCP SDK; no hardcoded tool list.

**Actions:**

1. Create `packages/mcp-server/` per layout above.
2. `package.json`:
   - name: `@curator/mcp-server`
   - deps: `@modelcontextprotocol/sdk`, `@curator/agent-server`, `@curator/host` (peer)
   - bin: `curator-mcp` → `dist/bin/curator-mcp.js`
3. Implement `createMcpServer(config)`:

```typescript
interface McpServerConfig {
  engine: CuratorEngine;
  prisma: CuratorPrismaClient;
  host?: CuratorHost;           // optional, for orchestration tools
  transport: 'stdio' | { http: { port: number } };
  /** Extra plugins to register before building registry (e.g. mcp-core) */
  registerBuiltinPlugins?: boolean;  // default true
  logger?: { error: (...args: unknown[]) => void };
}
```

4. On create:
   - If `registerBuiltinPlugins`, call `engine.registerPlugin(mcpCorePlugin({ prisma }))` and `engine.registerPlugin(mcpOrchestrationPlugin({ host, prisma }))` — **only if not already registered**.
   - Build `McpToolRegistry.fromEngine(engine)`.
   - Attach `ListToolsRequestSchema` → `registry.list()`.
   - Attach `CallToolRequestSchema` → `registry.call(name, args)`.
5. Refactor `server/src/mcp-server.ts` to thin wrapper importing `@curator/mcp-server` (backward compat).
6. **Do not** add a `switch (name)` for domain tools.

**Acceptance:**

- [ ] `npm run build` succeeds
- [ ] `createMcpServer({ engine, prisma, transport: 'stdio' })` starts without throw
- [ ] `list_tools` returns only tools with exposure metadata (may be empty before plugins)
- [ ] `server/src/mcp-server.ts` delegates to package

**Depends on:** CUR-002 (host with engine), CUR-006a (tool MCP metadata)

---

### CUR-006a — MCP metadata on `CuratorTool` + plugin policy

**Goal:** Single source of truth for “should this tool appear in MCP?”

**Actions:**

1. Add `mcp?`, `toMcpDeclaration()` to `CuratorTool` / `defineTool`.
2. Add `mcp?` policy to `CuratorPluginDefinition`.
3. Add `toolPlugins: Map<string, string>` on `CuratorEngine`.
4. Unit tests:
   - Tool with `mcp: { expose: true }` → included
   - Tool without mcp → excluded
   - Plugin `mcp: { exposeAll: true }` → all included except exclude list
   - Plugin `mcp: { include: ['a'] }` → only `a`

**Acceptance:**

- [ ] `toMcpDeclaration()` matches `toGenAiDeclaration()` shape but MCP naming
- [ ] Tests pass in `curator/` package

**Depends on:** nothing (can parallel CUR-006)

---

### CUR-007 — `McpToolRegistry` (plugin-driven list + dispatch)

**Goal:** Dynamic `list_tools` / `call_tool` from `engine.tools`.

**Actions:**

1. Create `McpToolRegistry.ts`:

```typescript
export class McpToolRegistry {
  constructor(
    private engine: CuratorEngine,
    private getContext: () => CuratorToolContext
  ) {}

  static fromEngine(engine: CuratorEngine, getContext: () => CuratorToolContext): McpToolRegistry;

  list(): Array<{ name: string; description: string; inputSchema: object }>;
  async call(name: string, args: Record<string, unknown>): Promise<McpCallResult>;
  refresh(): void;  // if plugins registered after server start
}
```

2. `list()` — iterate exposed tools, call `tool.toMcpDeclaration()`.
3. `call()` — resolve tool by MCP name (handle `mcp.name` override), invoke:

```typescript
const result = await tool.runAsync({ args, toolContext: this.getContext() });
return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
```

4. Errors → `{ content: [...], isError: true }` (match current mcp-server behavior).
5. `buildToolContext.ts` — resolve system user from prisma, pass `prisma`, `userId`, `projectId`.

**Acceptance:**

- [ ] Register plugin with `{ mcp: { expose: true } }` tool → appears in `list_tools` without editing mcp-server
- [ ] `call_tool` executes handler and returns JSON text
- [ ] Unknown tool name → clear error
- [ ] Internal tool (no expose) → not listed, call returns "unknown tool"

**Depends on:** CUR-006, CUR-006a

---

### CUR-008 — Builtin MCP plugins (replace hardcoded tools)

**Goal:** Core MCP tools are Curator plugins with `mcp: { expose: true }`, not switch cases.

#### `mcp-core-plugin.ts`

Port from `server/src/mcp-server.ts` + `executeScript.ts`:

| Tool name | Handler | mcp.expose |
|-----------|---------|------------|
| `execute_script` | `executeScript(...)` | true |
| `search_knowledge` | prisma resource/text search | true |
| `read_resource` | prisma resource + texts | true |
| `list_scripts` | prisma.script.findMany | true |
| `get_script` | prisma.script.findUnique | true |

Each implemented via `defineTool({ name, mcp: { expose: true }, parameters, execute })`.

Export factory:

```typescript
export function mcpCorePlugin(ctx: { prisma: CuratorPrismaClient }): CuratorPlugin
```

Plugin definition:

```typescript
{
  name: 'mcp-core',
  mcp: { exposeAll: false },  // only per-tool expose: true
  tools: { execute_script, search_knowledge, ... }
}
```

#### `mcp-orchestration-plugin.ts`

Host-aware tools for opencode ↔ facilitator loops:

| Tool name | Handler | mcp.expose |
|-----------|---------|------------|
| `trigger_agent` | `host.triggerAgent(name, context)` | true |
| `get_request` | prisma request + responses | true |
| `list_requests` | filter by status/agent | true |
| `pause_request` | `host.pauseRequest(id)` | true |
| `resume_request` | `host.resumeRequest(id, response)` | true |

Requires `host` in plugin factory:

```typescript
export function mcpOrchestrationPlugin(ctx: {
  host: CuratorHost;
  prisma: CuratorPrismaClient;
}): CuratorPlugin
```

**Acceptance:**

- [ ] After `createMcpServer({ registerBuiltinPlugins: true })`, `list_tools` includes all core + orchestration tools
- [ ] No `case 'execute_script':` in `createMcpServer.ts`
- [ ] `trigger_agent` via MCP creates Request row (integration test)

**Depends on:** CUR-007

---

### CUR-008a — Facilitator domain tools (example pattern)

**Not implemented in curator repo** — document pattern for facilitator agent:

```typescript
// facilitator/src/plugins/jira.ts
import { defineTool } from '@curator/agent-server';

export const jira_pickup = defineTool({
  name: 'jira_pickup',
  description: 'Pick next Jira issue from queue',
  mcp: { expose: true },   // ← automatic MCP listing
  parameters: { type: 'object', properties: { label: { type: 'string' } } },
  accessLevel: 'read_only',
  execute: async (args, ctx) => { /* ... */ },
});

export const jiraPlugin: CuratorPlugin = {
  name: 'facilitator-jira',
  mcp: { exclude: ['jira_internal_helper'] },  // optional
  tools: { jira_pickup, jira_comment, jira_internal_helper },
};
```

After `host.start()` + `createMcpServer({ engine: host.engine })`, opencode sees `jira_pickup` in MCP without any mcp-server code change.

---

### CUR-009 — CLI + host integration

**Goal:** One command to start MCP for a miniapp.

**Actions:**

1. `bin/curator-mcp.ts`:

```bash
# Option A: embed host boot (facilitator)
curator-mcp --config ./facilitator.mcp.json

# Option B: connect to existing host HTTP (future)
curator-mcp --host-url http://localhost:4000
```

2. Config file:

```json
{
  "miniapp": "./dist/host.js",
  "transport": "stdio"
}
```

Loads miniapp's `export async function createMcpHost()` that returns `{ engine, prisma, host }`.

3. Document opencode `mcp.json`:

```json
{
  "mcpServers": {
    "curator": {
      "command": "npx",
      "args": ["@curator/mcp-server", "stdio"],
      "env": { "DATA_DIR": "/data", "CURATOR_DATABASE_PATH": "/data/state/curator.db" }
    }
  }
}
```

4. Optional: `host.createMcpServer()` convenience on `@curator/host`:

```typescript
// packages/host/src/createMcpServerFromHost.ts
export function createMcpServerFromHost(host: CuratorHost, transport) {
  return createMcpServer({ engine: host.engine!, prisma: host.prisma, host, transport });
}
```

**Acceptance:**

- [ ] `curator-mcp` stdio works with Keeris or facilitator test harness
- [ ] opencode can list tools and call `trigger_agent`

**Depends on:** CUR-008

---

### CUR-010 — Runtime plugin refresh (optional P1.5)

If plugins register **after** MCP server starts:

```typescript
host.engine.registerPlugin(newPlugin);
mcpServer.registry.refresh();
```

Or subscribe to host event `plugins_registered` → auto refresh.

**Acceptance:** Dynamic registration updates `list_tools` without restart.

---

## Security & access control

| Rule | Implementation |
|------|----------------|
| Default deny | Tools not exposed unless `mcp.expose` or plugin policy |
| `accessLevel` | MCP `call_tool` checks `tool.accessLevel` — `destructive` may require env flag `MCP_ALLOW_DESTRUCTIVE=true` |
| `requiresConfirmation` | Log warning; future: return `isError` with confirmation token |
| Orchestration tools | Only registered when `host` passed to `createMcpServer` |
| System user | `buildToolContext` uses seeded system user (same as Keeris) |

---

## What NOT to do

| Anti-pattern | Instead |
|--------------|---------|
| Hardcode facilitator tool names in mcp-server | `mcp: { expose: true }` on plugin tools |
| Duplicate tool schemas in MCP and Curator | `parameters` → `inputSchema` via `toMcpDeclaration()` |
| Separate MCP registration API | Use `registerPlugin` only |
| Put paths/artifacts in mcp-server | Tools call domain code; paths in facilitator / `@curator/paths` |

---

## Dependency graph

```text
CUR-006a (tool metadata)     CUR-006 (package scaffold)
         \                         /
          → CUR-007 (McpToolRegistry)
                    → CUR-008 (builtin plugins)
                              → CUR-009 (CLI + host helper)
```

**Parallel with:** CUR-005 (`@curator/paths`) — artifact tools in facilitator use paths locally until then.

---

## Suggested PRs

| PR | Tasks | Title |
|----|-------|-------|
| PR1 | CUR-006a | `feat(agent-server): MCP exposure metadata on CuratorTool` |
| PR2 | CUR-006, CUR-007 | `feat(mcp-server): plugin-driven MCP registry` |
| PR3 | CUR-008, CUR-009 | `feat(mcp-server): core orchestration plugins + CLI` |

---

## Acceptance criteria (P1 complete)

- [ ] Zero hardcoded domain tools in `@curator/mcp-server`
- [ ] `defineTool({ mcp: { expose: true } })` → tool in `list_tools`
- [ ] Core knowledge/script tools work via plugin, not switch
- [ ] `trigger_agent`, `get_request`, `resume_request` available when host provided
- [ ] facilitator registers jira/bitbucket plugins → opencode sees them automatically
- [ ] `server/src/mcp-server.ts` uses package (no regression for existing MCP clients)

---

## Facilitator wiring (after P1)

```typescript
// facilitator/src/mcp.ts
import { createMcpServerFromHost } from '@curator/host/mcp'; // or @curator/mcp-server
import { host } from './host.js';

export async function startMcp() {
  await host.start();
  const mcp = await createMcpServer({
    engine: host.engine!,
    prisma: host.prisma,
    host,
    transport: 'stdio',
    registerBuiltinPlugins: true,
  });
  await mcp.listen();
}
```

```typescript
// facilitator/src/plugins/index.ts
export function registerFacilitatorPlugins(ctx) {
  curatorEngine.registerPlugin(mcpCorePlugin);      // if not using registerBuiltinPlugins
  curatorEngine.registerPlugin(jiraPlugin(ctx));
  curatorEngine.registerPlugin(bitbucketPlugin(ctx));
  curatorEngine.registerPlugin(opencodePlugin(ctx));
  return curatorEngine;
}
```

---

## Related docs

- [Curator Host plan](./curator-host.md) — CUR-002 prerequisite
- [Curator Opencode Integration (P2)](./curator-opencode-integration.md) — harness tools + HarnessGate (uses `resume_request`)
- `curator/server/src/mcp-server.ts` — port source
- `curator/curator/src/plugins/mcp/index.ts` — inverse mapping (MCP client → Curator)
- `curator/curator/src/tools/CuratorTool.ts` — extend for MCP metadata


# Curator Opencode Integration — P2 Development Plan

Detailed task descriptions for **opencode harness integration** and **AST workflow primitives** in the curator repo, plus facilitator wiring notes.

**Division of responsibility:**

| Layer | Owner | Role |
|-------|-------|------|
| Orchestration (cron, gates, Jira, git push) | Curator AST + ToolTasks | facilitator plugins |
| Coding sessions (plan / develop / commit / review) | opencode → Gemini/Vertex | harness |
| opencode → Curator callbacks | MCP (`@curator/mcp-server`) | P1 |
| Curator → opencode HTTP | `@curator/integrations-opencode` | P2 |
| Harness wait / resume | `Curator_HarnessGate` AST node | P2 |
| Reference pipelines | workflow builders | P2 |

**Depends on:** CUR-002 (`@curator/host`), CUR-007+ (`@curator/mcp-server` with `trigger_agent` / `resume_request`)  
**Reference implementation:** `autodev/autodev/src/autodev/opencode_client.py`, `autodev/autodev/src/autodev/jobs/opencode_units.py`

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│  Curator RequestProcessor (facilitator agent AST)                  │
│  Sequence: jira_pickup → plan_gate → opencode_plan → develop → …  │
└────────────┬───────────────────────────────┬─────────────────────┘
             │ Curator_Tool                   │ Curator_HarnessGate
             │ opencode_start / continue      │ WAITING_FOR_USER
             ▼                                ▼
┌────────────────────────┐         ┌──────────────────────────────┐
│ @curator/integrations- │  HTTP   │ Facilitator UI / Jira comment │
│ opencode OpencodeClient│◄───────►│ "Open opencode session" link  │
└────────────┬───────────┘         └──────────────────────────────┘
             │ POST /session, /session/:id/message
             ▼
┌────────────────────────┐         ┌──────────────────────────────┐
│ opencode server        │  MCP    │ opencode subagents use        │
│ agents/*.md, skills    │────────►│ trigger_agent, read_artifact  │
└────────────────────────┘         └──────────────────────────────┘
```

**Key rule:** Curator does not parse chat transcripts for handoffs. Structured artifacts (`artifacts/plans/*.json`) and `Request.context` pointers are written by ToolTasks or opencode MCP tools — same as autodev.

---

## Package layout

```text
curator/packages/integrations-opencode/
├── package.json              # name: @curator/integrations-opencode
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts
    ├── OpencodeClient.ts           # HTTP client (port from autodev)
    ├── types.ts
    ├── urls.ts                     # session UI URL, directory base64url
    ├── plugin/
    │   ├── index.ts
    │   └── createOpencodePlugin.ts # registers Curator tools
    └── tools/
        ├── opencode_start.ts
        ├── opencode_continue.ts
        ├── opencode_poll.ts
        ├── opencode_wait.ts
        └── opencode_abort.ts

curator/curator/src/engine/          # agent-server changes
├── CuratorAst.ts                    # + Curator_HarnessGate
├── CuratorAstValidation.ts
├── CuratorBuilder.ts
└── CuratorRequestProcessor.ts       # + handleHarnessGate

curator/packages/host/src/workflows/  # or packages/workflows/
├── index.ts
├── implementIssue.ts
└── reviewPr.ts
```

---

## Opencode HTTP contract (from autodev)

Port these behaviors into `OpencodeClient` (TypeScript). Source: `autodev/opencode_client.py`.

### Session lifecycle

| Method | HTTP | Notes |
|--------|------|-------|
| `createSession({ cwd })` | `POST /session` | No title on create (autodev applies prefix via PATCH later) |
| `sendMessage({ sessionId, cwd, prompt })` | `POST /session/:id/message` | Body: `{ parts: [{ type: 'text', text }] }` |
| `getMessages(sessionId, cwd)` | `GET /session/:id/message` | Stall recovery side-channel |
| `getSessionStatus(cwd)` | `GET /session/status` | Detect idle/aborted sessions |
| `patchTitle(sessionId, title, cwd)` | `PATCH /session/:id` | Optional prefix (`POMS-123 · …`) |
| `abort(sessionId, cwd)` | SDK `session.abort` | On timeout/error |

### Directory scoping (required)

Every request must pass **both**:

- Query: `?directory=<absolute-cwd>`
- Header: `x-opencode-directory: <absolute-cwd>`

autodev and opencode share `DATA_DIR` mount; `cwd` is a worktree path both containers see.

### URLs

```typescript
// urls.ts — must match opencode web UI routing
buildSessionUrl(publicBase: string, absoluteCwd: string, sessionId: string): string
// → {base}/{base64url(cwd)}/session/{sessionId}
```

Placeholder in prompts: `<opencode-session-url>` → replaced at send time with `sessionPublicUrl`.

### Polling semantics

| Concept | autodev | Curator tool mapping |
|---------|---------|---------------------|
| Fire-and-forget chat | `start_session` returns `SessionHandle` | `opencode_start` / `opencode_continue` |
| Non-blocking check | `poll(handle)` → `running \| done \| error` | `opencode_poll` |
| Block until done | poll loop in `PollSessionUnit` | `opencode_wait` (poll internally) |
| Stall recovery | `_reconcile_stalled`, `_check_idle` | Inside `opencode_wait` / `opencode_poll` |
| Continue same issue | `continue_session(session_id, …)` | `opencode_continue` |

### Config env vars (facilitator)

| Var | Purpose |
|-----|---------|
| `OPENCODE_BASE_URL` | Internal URL (`http://opencode:4096`) |
| `OPENCODE_PUBLIC_URL` | Browser URL (traefik host) |
| `OPENCODE_TIMEOUT_SECONDS` | Max chat duration |
| `OPENCODE_POLL_INTERVAL_SECONDS` | `opencode_wait` default interval |

---

## Task breakdown

### CUR-013 — Create `@curator/integrations-opencode` package scaffold

**Goal:** Publishable package with types and stub client.

**Actions:**

1. Create `packages/integrations-opencode/package.json`:
   - name: `@curator/integrations-opencode`
   - deps: `@curator/agent-server` (for `defineTool`), `node-fetch` or native `fetch`
   - peer: `@curator/host` (optional, for config)
2. `tsconfig.json` — match `packages/adapter-sqlite` pattern.
3. `types.ts`:

```typescript
export interface OpencodeClientConfig {
  baseUrl: string;
  publicBaseUrl?: string;
  timeoutSeconds: number;
  pollIntervalSeconds?: number;
}

export interface SessionHandle {
  sessionId: string;
  cwd: string;
  sessionUrl: string;
  sessionPublicUrl: string;
  startedAt: number;
  wallStartedAt: number;
  // opaque poll state (in-memory only, stored in Request.context by tools)
}

export type PollStatus = 'running' | 'done' | 'error';

export interface PollResult {
  status: PollStatus;
  text?: string;
  error?: string;
  retryable?: boolean;
}
```

4. `OpencodeClient.ts` — class skeleton with method signatures; methods throw `not implemented` except URL helpers.

**Acceptance:**

- [ ] `npm run build` succeeds
- [ ] `buildSessionUrl` unit test matches autodev base64url encoding

**Depends on:** nothing (parallel with P0/P1)

---

### CUR-013a — Implement `OpencodeClient` HTTP layer

**Goal:** Full port of autodev runner (minus asyncio — use async/await in Node).

**Actions:**

1. Implement `createSession`, `continueSession`, `sendMessage` (raw POST, not SDK — autodev avoids SDK typing issues).
2. Implement `poll(handle, { stallAfterSeconds? })` with:
   - timeout → abort + error
   - stall reconciliation via `GET /session/:id/message`
   - idle detection via `GET /session/status`
3. Implement `extractTextParts`, `describeRunError` (port from Python).
4. `SESSION_URL_PLACEHOLDER` constant + replacement in `sendMessage`.
5. Optional: `listSessions(directories)`, `streamEvents(directory)` for facilitator dashboard later.
6. No agent/model in message body — prompts `@mention` subagents (autodev convention).

**Acceptance:**

- [ ] Integration test against mock HTTP server (nock/msw) for create → message → poll done
- [ ] Stall recovery test: chat task never completes but messages endpoint has assistant reply → `done`
- [ ] Directory header/query sent on every call

**Depends on:** CUR-013

---

### CUR-013b — `createOpencodePlugin()` — plugin-driven Curator tools

**Goal:** Register opencode tools via `registerPlugin` — same pattern as Jira/git tools. Tools auto-expose on MCP when `mcp: { expose: true }` (P1).

**Actions:**

1. `createOpencodePlugin(config: OpencodePluginConfig)`:

```typescript
interface OpencodePluginConfig {
  client: OpencodeClient;
  /** Store poll handles in Request.context under this key */
  contextKey?: string;  // default: 'opencode'
  defaultStallAfterSeconds?: number;
}
```

2. Tools (each `defineTool` with `mcp: { expose: true }` where external agents need them):

| Tool | Args | Behavior |
|------|------|----------|
| `opencode_start` | `cwd`, `prompt`, `title?` | Create session + send message; return `{ sessionId, sessionPublicUrl, handle }` |
| `opencode_continue` | `sessionId`, `cwd`, `prompt` | Continue session |
| `opencode_poll` | `handle` (or `sessionId` + resolve from context) | Single poll step |
| `opencode_wait` | `handle`, `stallAfterSeconds?`, `maxWaitSeconds?` | Loop poll until done/error/timeout |
| `opencode_abort` | `sessionId`, `cwd` | Best-effort abort |

3. Tool handlers read/write `Request.context`:

```json
{
  "opencode": {
    "sessionId": "ses_…",
    "sessionPublicUrl": "https://…",
    "cwd": "/data/worktrees/issue-POMS-123-…",
    "handle": { /* serializable subset for poll */ }
  }
}
```

4. `handle` serialization: store `{ sessionId, cwd, startedAt, wallStartedAt }` — rehydrate client-side state in `opencode_poll`/`opencode_wait`.

5. Export plugin from package index; document facilitator registration:

```typescript
curatorEngine.registerPlugin(createOpencodePlugin({ client }));
```

**Acceptance:**

- [ ] AST `Curator_Tool` node calling `opencode_start` then `opencode_wait` completes in processor integration test
- [ ] Tools appear in MCP `list_tools` when plugin registered (with P1 metadata)
- [ ] No hardcoded opencode tool names outside plugin package

**Depends on:** CUR-013a, CUR-006a (MCP expose metadata), CUR-002 (processor)

---

### CUR-014 — `Curator_HarnessGate` AST node

**Goal:** First-class “pause for external harness” node — distinct from `Curator_HumanInput` (generic text/choices/file).

**Why not reuse `Curator_HumanInput`?**

| | `Curator_HumanInput` | `Curator_HarnessGate` |
|--|----------------------|------------------------|
| Resume payload | Free text / choice | Structured: `{ opencodeSessionId, gateId, … }` |
| UI | Form in Console | Link to opencode web + optional auto-start |
| Context | `targetUserId` | `harnessType`, `gateId`, `cwd`, `promptTemplate` |
| Facilitator | Generic | Knows to call `resume_request` after session live |

**Actions:**

1. **`CuratorAst.ts`** — add node:

```typescript
export interface CuratorHarnessGateNode extends CuratorBaseNode {
  type: 'Curator_HarnessGate';
  name?: string;
  gateId: string;                    // unique within workflow, e.g. 'plan', 'develop'
  harnessType: 'opencode' | string;  // extensible
  /** Merged into Request.context on pause */
  contextTemplate?: Record<string, unknown>;
  /** If set, facilitator may auto-call opencode_start with this prompt */
  autoStart?: {
    cwdExpr: string;      // e.g. '{context.worktreePath}' — resolved at runtime
    promptExpr: string;   // e.g. '@planner …'
    titleExpr?: string;
  };
  /** Tool to run on resume before continuing AST (optional) */
  resumeTool?: string;
}
```

2. **`CuratorAstValidation.ts`** — JSON schema for node; add to supported `nodeTypes` list in processor.

3. **`CuratorBuilder.ts`**:

```typescript
static harnessGate(opts: {
  gateId: string;
  harnessType?: 'opencode';
  contextTemplate?: Record<string, unknown>;
  autoStart?: { cwdExpr: string; promptExpr: string; titleExpr?: string };
}): CuratorHarnessGateNode
```

4. **`CuratorRequestProcessor.ts`** — `handleHarnessGate(ast, req)`:

   - Merge `contextTemplate` into `req.context`
   - Set context flags:
     ```json
     {
       "awaitingHarness": true,
       "harnessType": "opencode",
       "gateId": "plan",
       "harnessGate": { "gateId": "plan", "startedAt": "…" }
     }
     ```
   - Set status `WAITING_FOR_USER` (reuse existing wake-up path on new Response)
   - Emit host event `request_waiting_for_user` with `{ requestId, gateId, harnessType }`

5. **Resume contract** — document + enforce in processor poll loop:

   - New `Response` on request with content JSON:
     ```json
     { "gateId": "plan", "opencodeSessionId": "ses_…", "sessionPublicUrl": "…" }
     ```
   - Processor validates `gateId` matches paused gate
   - Merges into context, clears `awaitingHarness`, sets status `WAITING`, continues AST

6. **Script:** `curator/scripts/test_harness_gate.ts` — gate → mock response → continues.

**Acceptance:**

- [ ] Gate pauses request; resume with matching `gateId` continues workflow
- [ ] Resume with wrong `gateId` → FAILED or ignored with error response
- [ ] Schema tests valid/invalid node
- [ ] `CuratorBuilder.harnessGate` produces valid AST

**Depends on:** CUR-002, CUR-004 (events); coordinate with CORE_HARDENING P0 AST validation

---

### CUR-014a — Facilitator harness resume bridge (facilitator repo — spec only)

**Not in curator repo** — documented for integration:

1. Subscribe to `request_waiting_for_user` where `harnessType === 'opencode'`.
2. If `autoStart` in gate AST: call `opencode_start` via tool or `OpencodeClient` directly.
3. Else: post Jira comment / show UI button with `sessionPublicUrl` placeholder.
4. On session ready: `host.resumeRequest(requestId, { gateId, opencodeSessionId, sessionPublicUrl })`.
5. Optional: human-in-the-loop only before first opencode step (gate without `autoStart`).

---

### CUR-015 — Workflow builder helpers

**Goal:** Reference ASTs for implement-issue and review-PR pipelines — overridable by facilitator.

**Location:** `packages/host/src/workflows/` or `packages/workflows/` (prefer host if small).

**Actions:**

1. **`implementIssueWorkflow(opts)`** — returns `{ ast, requiredTools, requiredAgents }`:

```text
Curator_Sequential:
  1. Curator_Tool: jira_pickup
  2. Curator_Tool: prepare_worktrees        # facilitator git plugin
  3. Curator_Tool: opencode_start + opencode_wait  # OR HarnessGate + autoStart
     @planner subagent prompt
  4. Curator_Tool: sync_plan_artifact       # write artifacts/plans/*.json
  5. Curator_HarnessGate: gateId=approve_plan (optional HITL)
  6. Curator_Tool: opencode_continue @developer
  7. Curator_Tool: opencode_continue @committer
  8. Curator_Tool: create_pr
  9. Curator_Tool: jira_comment_status
```

2. **`reviewPrWorkflow(opts)`**:

```text
Curator_Sequential:
  1. Curator_Tool: bitbucket_pickup_pr
  2. Curator_Tool: prepare_review_worktree
  3. Curator_HarnessGate or opencode_start @reviewer
  4. Curator_Tool: sync_review_artifact
  5. Curator_Tool: publish_review
```

3. **`AgentManifest` helpers** — export manifest entries for seeding:

```typescript
export const IMPLEMENT_ISSUE_AGENT: AgentManifest = {
  name: 'implement_issue',
  enabled: false,
  ast: implementIssueWorkflow({ useHarnessGate: true }),
};
```

4. Context placeholders documented:

| Placeholder | Set by |
|-------------|--------|
| `{context.jiraKey}` | jira_pickup |
| `{context.worktreePath}` | prepare_worktrees |
| `{context.opencode.sessionId}` | opencode_start |
| `{context.planId}` | sync_plan_artifact |

5. Options struct:

```typescript
interface ImplementIssueWorkflowOptions {
  useHarnessGate?: boolean;      // true = HITL before plan/develop
  autoStartOpencode?: boolean;   // false = human opens session
  hitlGates?: ('plan' | 'develop')[];
}
```

**Acceptance:**

- [ ] AST validates against `CuratorAstValidation`
- [ ] `requiredTools` lists every `toolName` used (for seed validation script)
- [ ] Documented in README with override example

**Depends on:** CUR-014, CUR-013b, CUR-003 (seed)

---

### CUR-015a — `Curator_ExternalTool` node (optional P2.5)

Generic HTTP tool node with retry/timeout for webhooks or non-opencode harnesses. Defer if `Curator_Tool` + opencode plugin suffices.

---

## Interaction with MCP (P1)

opencode subagents call Curator via MCP (already planned):

| MCP tool | Used by opencode for |
|----------|---------------------|
| `trigger_agent` | Start downstream Curator agent from chat |
| `get_request` | Poll orchestration status |
| `resume_request` | Complete harness gate from opencode side (alternative to facilitator UI) |
| `read_artifact` / `write_artifact` | Plan/review sidecars |
| Facilitator tools (`jira_*`, …) | If `mcp: { expose: true }` |

**Bidirectional loop (optional):**

```text
Curator opencode_wait (harness running)
  → opencode subagent calls MCP resume_request when done
  → Curator processor wakes without facilitator polling
```

Document as recommended pattern in README; implement facilitator handler in facilitator repo.

---

## What stays in facilitator (not curator)

| Item | Location |
|------|----------|
| `opencode/opencode.jsonc` | facilitator |
| `opencode/agents/*.md` (planner, developer, committer, reviewer) | facilitator |
| `opencode/skills/` (jira, bitbucket) | facilitator |
| docker-compose opencode service | facilitator |
| `registerFacilitatorPlugins()` | facilitator |
| Jira/Bitbucket/git ToolTasks | facilitator plugins |
| Dashboard session log UI | facilitator Vue (optional) |

Copy from `autodev/opencode/` as starting point.

---

## Docker / runtime (facilitator)

Mirror `autodev-stack.yml` pattern:

```yaml
services:
  facilitator:
    environment:
      OPENCODE_BASE_URL: http://opencode:4096
      OPENCODE_PUBLIC_URL: https://opencode.example.com
      DATA_DIR: /data
    volumes:
      - ./data:/data

  opencode:
    environment:
      HOME: /data
      OPENCODE_CONFIG: /config/opencode.jsonc
    volumes:
      - ./data:/data
      - ./opencode/opencode.jsonc:/config/opencode.jsonc
      - ./opencode/agents:/data/.config/opencode/agents
```

Curator host and opencode share `/data` so `cwd` in `opencode_start` resolves on both sides.

---

## Security

| Concern | Mitigation |
|---------|------------|
| opencode tools are `elevated` | `accessLevel: 'elevated'` on plugin tools; MCP may require `MCP_ALLOW_ELEVATED=true` |
| Session URLs in Jira | Use `OPENCODE_PUBLIC_URL` only in human-facing links |
| Harness gate resume | Validate `gateId`; ignore stale responses |
| Timeouts | `opencode_wait` respects `OPENCODE_TIMEOUT_SECONDS`; abort session on failure |

---

## Dependency graph

```text
CUR-013 scaffold
  → CUR-013a OpencodeClient
      → CUR-013b createOpencodePlugin

CUR-014 HarnessGate (parallel after CUR-002)
  → CUR-015 workflow builders

P1 MCP (resume_request) ←── used by CUR-014 resume + opencode agents
```

---

## Suggested PRs (curator repo)

| PR | Tasks | Title |
|----|-------|-------|
| PR1 | CUR-013, CUR-013a | `feat(integrations-opencode): OpencodeClient HTTP port` |
| PR2 | CUR-013b | `feat(integrations-opencode): opencode Curator plugin tools` |
| PR3 | CUR-014 | `feat(agent-server): Curator_HarnessGate AST node` |
| PR4 | CUR-015 | `feat(host): implement/review workflow builders` |

---

## Acceptance criteria (P2 complete)

- [ ] `@curator/integrations-opencode` published in monorepo
- [ ] `createOpencodePlugin` registers tools; no opencode logic in facilitator except `registerPlugin`
- [ ] `opencode_start` + `opencode_wait` work inside `Curator_Tool` AST steps
- [ ] `Curator_HarnessGate` pauses and resumes with structured session payload
- [ ] `implementIssueWorkflow()` produces valid, documented AST
- [ ] Facilitator can copy autodev opencode config and run implement pipeline with Curator orchestration
- [ ] opencode MCP tools can `resume_request` to wake harness gate (documented)

---

## Facilitator wiring example (after P2)

```typescript
// facilitator/src/plugins/index.ts
import { createOpencodePlugin, OpencodeClient } from '@curator/integrations-opencode';

const opencode = new OpencodeClient({
  baseUrl: process.env.OPENCODE_BASE_URL!,
  publicBaseUrl: process.env.OPENCODE_PUBLIC_URL,
  timeoutSeconds: Number(process.env.OPENCODE_TIMEOUT_SECONDS ?? 3600),
});

export function registerFacilitatorPlugins(ctx: PluginRegistrationContext) {
  curatorEngine.registerPlugin(corePlugin);
  curatorEngine.registerPlugin(createOpencodePlugin({ client: opencode }));
  curatorEngine.registerPlugin(jiraPlugin(ctx));
  curatorEngine.registerPlugin(bitbucketPlugin(ctx));
  curatorEngine.registerPlugin(gitPlugin(ctx));
  return curatorEngine;
}
```

```typescript
// facilitator/src/agents.ts
import { IMPLEMENT_ISSUE_AGENT, REVIEW_PR_AGENT } from '@curator/host/workflows';

export const FACILITATOR_AGENTS = [IMPLEMENT_ISSUE_AGENT, REVIEW_PR_AGENT];
```

---

## Related docs

- [Curator Host (P0)](./curator-host.md)
- [Curator MCP Server (P1)](./curator-mcp-server.md)
- autodev: `autodev/autodev/src/autodev/opencode_client.py`
- autodev: `autodev/opencode/opencode.jsonc`, `autodev/opencode/agents/*.md`
- Curator: `curator/curator/scripts/test_pattern_human.ts` (HumanInput reference)
- Curator: `curator/CORE_HARDENING_PLAN.md` (AST validation for new node types)

