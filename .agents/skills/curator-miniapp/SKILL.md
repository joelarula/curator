---
name: curator-miniapp
description: >-
  Scaffold, build, and maintain standalone Curator MiniApps with GraphQL APIs,
  Vue 3 web frontends, dynamic multi-database support (SQLite, PostgreSQL, MariaDB/MySQL),
  Prisma, WebAssembly (WASM) in-worker OPFS SQLite execution, and Curator Agent Server orchestration.
---

# Curator MiniApp Development Skill

This skill provides comprehensive instructions, patterns, and templates for building, maintaining, and scaling **Curator MiniApps**.

A Curator MiniApp is a lightweight, domain-focused application that embeds directly with the **Curator Orchestration Core** (`@curator/agent-server`). It combines domain-specific data management, GraphQL API access, interactive Vue 3 web dashboards, and background agent automation workflows.

---

## 1. Supported Architectures

Curator MiniApps can be deployed in two operational modes:

### Mode A: Browser-Native WASM + OPFS Engine (Zero-Backend)
Runs 100% inside the browser using `@sqlite.org/sqlite-wasm` on the Origin Private File System (OPFS), executing Curator AST workflows in a dedicated Web Worker without requiring a Node.js server.
- **Persistence**: Real disk persistence via OPFS synchronous access handles (`/app.sqlite3`).
- **Orchestration**: Web Worker polls `requests` table and executes AST nodes (`Sequence`, `ForEach`, `ToolTask`).
- **Checkpointing**: Pause and resume support with inter-step index tracking (`__pausedStepIndex__`, `__pausedIterIndex__`).
- **Dev Console**: Global floating/docked console (`CuratorConsole.vue`) for live logging, 1-click database export/import, AST inspection, and storage health.
- *Detailed Guide*: See [WASM & OPFS MiniApp Guide](./references/wasm-opfs-miniapp.md).

### Mode B: Server-Hosted Dual-DB Architecture (Node.js + Express)
Uses an Express backend serving static web assets and a unified `/graphql` endpoint, backed by dual databases (domain entities + Curator orchestration DB).
- **Multi-Database**: Dynamic engine support (SQLite, PostgreSQL, MariaDB/MySQL).
- **Scheduling**: Bree cron runner executing scheduled agent jobs in background Node threads.
- *Detailed Guide*: See [Multi-Engine Setup](./references/db-multi-engine.md) and [Curator Setup Template](./references/setup-curator-template.md).

### Mode C: Terminal Asynchronous REPL & Direct SQLite Execution (Headless)
Provides an interactive terminal interface for human actors to interact with the Curator engine, domain tools, and workflows via an asynchronous REPL (`@curator/host`).
- **Continuous Asynchronous REPL**: Non-blocking readline loop powered by Node Commander (`program = new Command()`).
- **Whitelisted Tool Registration**: Directly registers domain tools on Commander; free-text input cleanly routes to ambient speech tools.
- **Dual-Channel Flexibility**: Supports in-process direct SQLite execution (`createDirectChannel`) with zero network overhead, or remote WebSocket streaming (`createWebSocketChannel`).
- **Non-Blocking Turns**: Choices emitted by AST flows are non-blocking by default (blocking only if explicitly stated in flow context).
- **Zero Workflow Primitives in Client**: State progression, game turns, and pause/resume logic are driven exclusively by the Curator AST engine.
- *Detailed Guide*: See [Client REPL Architecture](./references/client-repl-architecture.md).

---

## 2. Directory Structure

```text
miniapps/<miniapp-name>/
├── prisma/
│   └── schema.prisma              # Domain Prisma Schema (PostgreSQL / MariaDB / SQLite)
├── prisma-sqlite/
│   └── schema.prisma              # Standalone SQLite Schema (Domain + Curator AST Entities)
├── wasm/                          # In-Browser WASM Architecture
│   ├── generated-schema.js        # Auto-generated DDL from prisma-sqlite/schema.prisma
│   ├── sqlite-opfs.js             # SQLite WASM boot, OPFS sync handle, export/import
│   ├── db-worker.js               # Dedicated Web Worker hosting DB & RequestProcessor
│   ├── wasm-curator-engine.js     # Browser-native AST executor, pause/resume, tools
│   ├── graphql-schema.js          # In-Worker GraphQL schema & resolvers
│   └── graphql-client.js          # Transparent dual-mode client (Server / WASM Worker)
├── scripts/
│   ├── generate-sqlite-schema.js  # Compiles prisma-sqlite schema -> wasm/generated-schema.js
│   ├── create-clean-seed.js       # Generates clean virgin database (0 episodes/tracks)
│   ├── export-seed-sqlite.js      # Exports full archive database snapshot
│   └── verify-data.js             # Verifies database statistics and sanity checks
├── src/                           # Server-Hosted & Terminal REPL Mode
│   ├── client/                    # Terminal Asynchronous REPL Architecture
│   │   ├── <miniapp>ClientShell.ts# Whitelisted tools, REPL commands, speech routing
│   │   └── <miniapp>Client.ts     # Channel factory (Direct / WebSocket) & UI loop
│   ├── cli.ts                     # Commander CLI entry (seed, exec, run, repl)
│   ├── host.ts                    # CuratorHost factory & SQLite DB boot
│   ├── db.ts                      # Multi-DB engine abstraction
│   ├── plugins/                   # Domain plugins, tools, and agent definitions
│   └── server/                    # Server hosting web static + /graphql + WebSocket
├── web/                           # Vue 3 + Vite Frontend
│   ├── serve.json                 # COOP / COEP header configuration for OPFS
│   ├── vite.config.js             # Vite config with SharedArrayBuffer security headers
│   └── src/
│       ├── App.vue                # Masthead with 🤖 Dev Console toggle (Ctrl + `)
│       └── components/
│           ├── CuratorConsole.vue # Global Dev Console (logs, export/import, AST, health)
│           └── AgentManager.vue   # Program agent control cards & status
├── Dockerfile                     # Container deployment
└── package.json                   # MiniApp dependencies & build scripts
```

---

## 3. The Prisma-to-WASM Pipeline

To eliminate fragile hand-written SQL strings, the SQLite database DDL is generated directly from Prisma:

1. **Define Models in `prisma-sqlite/schema.prisma`**:
   Define domain entities alongside formal Curator AST entities (`User`, `Project`, `Conversation`, `Script`, `Agent`, `Request`, `Response`).

2. **Generate DDL Script (`scripts/generate-sqlite-schema.js`)**:
   ```javascript
   import { execSync } from 'node:child_process';
   import { writeFileSync } from 'node:fs';
   import { resolve, dirname } from 'node:path';
   
   const root = resolve(dirname(import.meta.url.replace(/^file:\/\/\/?/, '')), '..');
   const schemaPath = resolve(root, 'prisma-sqlite/schema.prisma');
   const outPath = resolve(root, 'wasm/generated-schema.js');
   
   const sql = execSync(`npx prisma migrate diff --from-empty --to-schema-datamodel "${schemaPath}" --script`, {
     encoding: 'utf-8',
   });
   
   writeFileSync(outPath, `export const SCHEMA_DDL = ${JSON.stringify(sql)};\n`, 'utf-8');
   ```

3. **Execute DDL in `sqlite-opfs.js`**:
   `db.exec(SCHEMA_DDL)` runs both on cold OPFS boot and after snapshot imports, ensuring all tables and indexes exist without discrepancies.

---

## 4. OPFS Synchronous Access & Security Headers

WASM SQLite requires `SharedArrayBuffer` and synchronous filesystem handles. All dev and static servers MUST return:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

- **In `web/serve.json`**:
  ```json
  {
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [{
      "source": "**",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }]
  }
  ```
- **In `package.json`**:
  ```json
  "preview:web": "npx serve -s web-dist -p 3000 -c serve.json"
  ```

---

## 5. Curator In-Worker AST Execution & Pause/Resume

Workflows are executed exclusively via **Formal AST Nodes** inside `db-worker.js`:

```javascript
// Step checkpointing in Sequence AST:
for (let i = startStepIndex; i < node.steps.length; i++) {
  if (isPaused()) {
    context.__pausedStepIndex__ = i;
    db.exec('UPDATE requests SET status = ?, context = ? WHERE id = ?', ['paused', JSON.stringify(context), id]);
    return { paused: true, stepIndex: i };
  }
  await executeStep(node.steps[i], context);
}
```

- UI emits `toggleProcessorPause()` $\rightarrow$ Worker stops dispatching and checkpoints the running request $\rightarrow$ UI reflects `⏸ PAUSED`.
- Resuming recovers `__pausedStepIndex__` and continues without losing scraped progress.

---

## 6. Database Lifecycle & Dev Tools

MiniApps provide complete self-service database testing:

1. **1-Click Binary Export (`exportDatabase`)**:
   Flushes WAL checkpoints and streams OPFS `/app.sqlite3` as a `.sqlite3` file download.
2. **1-Click Binary Import (`importDatabase`)**:
   Accepts user-uploaded `.sqlite3` or `.db` files and replaces the OPFS file via `OpfsDb.importDb()`.
3. **Clean Virgin Seed vs Archive Seed**:
   - `npm run export:seed:clean`: Creates an empty database (0 episodes/tracks) with all agents initialized.
   - `npm run export:seed`: Preserves the full historical dataset.
   - `🗑 Reset Database`: Drops OPFS entry and hydrates the configured seed snapshot.

---

## 7. Terminal Asynchronous REPL & Dual-Channel Setup (`@curator/host`)

MiniApps can expose a declarative, interactive terminal REPL allowing human actors to interact with the Curator engine, execute tools, and join agent workflows without running a browser or web server.

### Architecture Invariants

1. **Continuous Asynchronous REPL**: Powered by Node's `commander.Command` (`program = new Command()`). The prompt remains open continuously for streaming output and interactive input.
2. **Whitelisted Tool Registration**: Domain tools from `plugin.tools` are registered directly onto the Commander program. Free-text inputs that do not match registered tool names cleanly fall through to a miniapp-specific speech tool (e.g. `blueprint_speech`).
3. **Dual-Channel Flexibility**:
   - **Direct SQLite Channel (`createDirectChannel`)**: Boots in-process with direct SQLite access (`CuratorHost.start()`), zero network latency, and local AST execution. Ideal for development, automated CI, and offline CLI workflows.
   - **Remote Server Channel (`createWebSocketChannel`)**: Connects over WebSocket (`ws://localhost:4000/graphql`) with real-time subscription streaming. Ideal for shared agent networks and multi-actor sessions.
4. **Non-Blocking Turns**: Choices emitted by workflow steps are non-blocking by default (blocking only if explicitly flagged in AST context).
5. **No Client Workflow Primitives**: Turn resolution, game states, pauses, and agent orchestration live exclusively inside the Curator AST engine—not in the client shell.

### Client Shell Registration (`src/client/<miniapp>ClientShell.ts`)

```typescript
import { ClientShell, CuratorToolDefinition } from '@curator/host';
import { demoPlugin, blueprintSpeechTool } from '../plugins/demo.js';

export function createBlueprintClientShell(options = {}) {
  // 1. Whitelist domain tools from plugin
  const whitelistedTools = (demoPlugin.tools || []).filter(
    (t): t is CuratorToolDefinition => t.name !== 'blueprint_speech'
  );

  return new ClientShell({
    name: 'blueprint',
    prompt: 'blueprint> ',
    tools: whitelistedTools,
    ambientSpeechTool: 'blueprint_speech',
    commands: [
      {
        name: 'status',
        description: 'Display current session status and active choices',
        action: async (args, shell) => {
          shell.renderStatus({ engine: 'online', choices: shell.getActiveChoices().length });
        },
      },
    ],
    ...options,
  });
}
```

### CLI Runner Wiring (`src/cli.ts`)

```typescript
program
  .command('repl')
  .alias('shell')
  .description('Start interactive asynchronous REPL shell')
  .option('-d, --direct', 'Run direct in-process SQLite engine (no server required)', true)
  .option('-s, --server <url>', 'Connect to remote Curator server WebSocket (e.g. ws://localhost:4000/graphql)')
  .action(async (opts) => {
    const { runBlueprintClient } = await import('./client/blueprintClient.js');
    await runBlueprintClient({
      direct: opts.direct && !opts.server,
      serverUrl: opts.server,
    });
  });
```

---

## 8. Developer & Build Workflow

### Local Development

```powershell
# 1. Run interactive in-process SQLite REPL (Zero-server, instant boot)
npm run repl:direct

# 2. Run REPL against a live Curator server
npm run repl -- --server ws://localhost:4000/graphql

# 3. Update SQLite DDL when prisma schema changes
node scripts/generate-sqlite-schema.js

# 4. Run Vite web dev server with COOP/COEP headers
npm run dev:web
```

### Production Build & Verification

```powershell
# 1. Generate clean seed (or archive seed)
npm run export:seed:clean

# 2. Bundle Vue 3 + WASM assets
npm run build:web

# 3. Preview locally on port 3000
npm run preview:web

# 4. Verify database state
node scripts/verify-data.js
```

---

## 9. Reference Documents

- [Client REPL Architecture & SQLite Dual-Channel](./references/client-repl-architecture.md)
- [WASM & OPFS In-Browser Architecture](./references/wasm-opfs-miniapp.md)
- [Multi-Engine Database Setup Guide](./references/db-multi-engine.md)
- [GraphQL & Curator Bridge Reference](./references/graphql-curator-bridge.md)
- [Curator Setup & Tool Registration Template](./references/setup-curator-template.md)
