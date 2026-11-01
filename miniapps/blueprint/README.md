# Curator Blueprint MiniApp

A reference starter template for building domain-focused **Curator MiniApps** powered by `@curator/host`.

---

## Features

- **Full-Stack Web Dashboard**: Vue 3 + Vite frontend with real-time telemetry, agent triggers, and tool runner.
- **Embedded Curator Dev Console**: Universal `<CuratorConsole>` integration (toggle with `Ctrl + \`` or masthead pill) for AST step inspection, engine pause/resume, and 1-click SQLite binary export/import.
- **SQLite Persistence**: Built-in SQLite orchestration database located at `./data/state/curator.db`.
- **Domain Plugin**: Clean separation of domain tools and workflows in `src/plugins/demo.ts`.
- **Command-Line Interface**: CLI commands for seeding, direct tool execution, and synchronous terminal runs (`npm run seed`, `npm run exec`, `npm run run`, `npm run trigger`).
- **CoffeeScript Integration**: Native support for in-AST CoffeeScript nodes and standalone `.coffee` script pipelines.
- **Server Daemon**: Express HTTP API with real-time WebSocket event streaming (`/api/events`).
- **Zero Boilerplate**: Lifecycle, processor loops, and seeding are managed by `@curator/host`.

---

## Directory Layout

```
miniapps/blueprint/
├── package.json
├── tsconfig.json
├── README.md
├── test/
│   └── blueprint.test.ts      # Unit tests
├── web/                       # Full-Stack Vue 3 + Vite Frontend
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.ts
│       ├── App.vue            # Interactive UI + Embedded <CuratorConsole>
│       ├── curator-adapter.ts # Universal CuratorConsoleAdapter implementation
│       └── style.css          # Design system & dark theme tokens
├── examples/
│   ├── direct_tool_call.ts         # In-process tool execution & MCP declarations
│   ├── coffeescript_verbs.ts       # Natural Verbs DSL & Automatic AST compilation
│   ├── mcp_server_client.ts        # MCP tool registry discovery and invocation
│   ├── events_streaming.ts         # Real-time typed event bus listeners
│   └── coffeescript_pipeline.coffee # Standalone CoffeeScript AST workflow definition
└── src/
    ├── host.ts                # CuratorHost bootstrap & plugin registration
    ├── cli.ts                 # CLI tool (seed, exec, run, trigger, chat, agent, status)
    ├── plugins/
    │   └── demo.ts            # Domain plugin (tools)
    └── server/
        └── index.ts           # Long-running HTTP, GraphQL & WebSocket daemon
```

---

## Getting Started

### 1. Build TypeScript

```bash
npm run build
```

### 2. Seed Database

```bash
npm run seed
```

### 3. Execute a Tool Directly In-Process

```bash
npm run exec calculate_metric -- -a '{"baseValue": 35, "multiplier": 3}'
```

### 4. Start Server Daemon

```bash
npm run dev:server
```

---

## Runnable Code Examples

```bash
# Direct in-process tool execution & MCP schema inspection
npm run example:tool

# Natural CoffeeScript Verbs & Automatic Execution AST Generation
npm run example:coffee-verbs

# Model Context Protocol (MCP) server & client invocation
npm run example:mcp

# Real-time Host lifecycle events & topic streaming
npm run example:events
```

---

## Curator Core Execution Guarantees

When defining workflows using CoffeeScript Natural Verbs (`while_loop`, `seq`, `set_state`, `wait_event`, `emit_event`):

```coffeescript
# Curator Core automatically maintains context, turn state, and database response logs
while_loop "$context.turn <= 5",
  seq [
    wait_event "game:ping"
    set_state turn: "$context.turn + 1", score: "$context.turn * 10"
    emit_event "game:pong", turn: "$context.turn", sender: "alpha"
  ]
```

`CuratorRequestProcessor` guarantees:
1. `$context.turn` and state are committed to the database after each step.
2. `Response` and audit records are created per turn automatically.
3. Peer sessions and token permissions are validated against the database.


---

## Harness POC: Gemini agent + remote MCP tools with Google sign-in

Two separate Curator apps, each with its own SQLite database:

| App | Folder | Command | Database | Role |
|---|---|---|---|---|
| **blueprint server** | [`miniapps/blueprint-server`](../blueprint-server/README.md) | `npm run dev` | `blueprint-server/data/curator.db` | MCP provider (Streamable HTTP `:4200/mcp`), one tool `web_scrape`; verifies Google id_tokens via JWKS; callers become Curator users with role `web_reader` |
| **blueprint** (REPL harness) | `miniapps/blueprint` (this app) | `npm run repl` | `data/state/curator.db` | Gemini agent `web_assistant` with `tools: ['mcp.blueprint.*']`; Google device-flow sign-in in the REPL |

Root `.env`:

```
GOOGLE_API_KEY=...                       # Gemini
GOOGLE_CLIENT_ID=...                     # web client (accepted by the server)
CLIENT_ID_BLUEPRINT=...                  # "TVs and Limited Input devices" client (REPL device flow)
CLIENT_SECRET_BLUEPRINT=...
BLUEPRINT_ALLOWED_EMAILS=you@gmail.com   # server allow list (emails or @domains)
# optional: BLUEPRINT_MCP_URL (default http://127.0.0.1:4200/mcp), BLUEPRINT_SERVER_PORT, BLUEPRINT_MODEL
```

Everything else lives in [`blueprint.config.yaml`](blueprint.config.yaml): MCP servers (`mcp.<name>.url`, `idp`),
sign-in providers (`auth`), model, data dir, web server port, and the `host:` section for `createCuratorHost`.
Profiles layer `blueprint.config.<profile>.yaml` and `.env.<profile>` on top: `npm run repl -- --profile dev`,
or `BLUEPRINT_PROFILES=dev`. The env vars above still win over the files.

Run: in `miniapps/blueprint-server` start `npm run dev`, then here `npm run repl`. The REPL registers the server; without a session it
starts the device login (google.com/device + code). After sign-in, type e.g. `summarize https://example.com`.
`/auth list | login google | logout google` manage the session (tokens in `~/.curator/credentials`).
