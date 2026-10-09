# Curator Blueprint MiniApp

A reference starter template for building domain-focused **Curator MiniApps** powered by `@curator/host`.

---

## Features

- **Full-Stack Web Dashboard**: Vue 3 + Vite frontend with real-time telemetry, agent triggers, and tool runner.
- **Embedded Curator Dev Console**: Universal `<CuratorConsole>` integration (toggle with `Ctrl + \`` or masthead pill) for AST step inspection, engine pause/resume, and 1-click SQLite binary export/import.
- **SQLite Persistence**: Built-in SQLite orchestration database located at `./data/state/curator.db`.
- **Domain Plugin**: Clean separation of domain tools and workflows in `src/plugins/demo.ts`.
- **Command-Line Interface**: CLI commands for seeding, direct tool execution, and synchronous terminal runs (`npm run seed`, `npm run exec`, `npm run run`, `npm run trigger`).
- **Interactive Dialog Loop & Script Playground**: Human-in-the-loop dialog workflow executing tools dynamically.
- **CoffeeScript Integration**: Native support for in-AST CoffeeScript nodes and standalone `.coffee` script pipelines.
- **Distributed P2P Mesh**: Dynamic multi-host federated communication with remote MCP proxying (`@curator/federation`).
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
│   ├── agent_daemon.ts             # Side A: Background Dialog Agent runner
│   ├── cli_client.ts               # Side B: Interactive human CLI chat client
│   ├── dialog_loop.ts              # Programmatic simulation of an interactive dialog turn
│   ├── direct_tool_call.ts         # In-process tool execution & MCP declarations
│   ├── coffeescript_execution.ts   # Dynamic CoffeeScript agent compilation & execution
│   ├── coffeescript_verbs.ts       # Natural Verbs DSL & Automatic AST compilation
│   ├── mcp_server_client.ts        # MCP tool registry discovery and invocation
│   ├── events_streaming.ts         # Real-time typed event bus listeners
│   ├── p2p_pingpong.ts             # Symmetric P2P Host Ping-Pong / Cuckoo Harness
│   └── coffeescript_pipeline.coffee # Standalone CoffeeScript AST workflow definition
└── src/
    ├── host.ts                # CuratorHost bootstrap & plugin registration
    ├── cli.ts                 # CLI tool (seed, exec, run, trigger, chat, agent, status)
    ├── plugins/
    │   └── demo.ts            # Domain plugin (tools & agents)
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

### 3. Run Interactive Dialog Agent in Terminal

```bash
npm run run dialog_playground
```

### 4. Execute a Tool Directly In-Process

```bash
npm run exec calculate_metric -- -a '{"baseValue": 35, "multiplier": 3}'
```

### 5. Start Server Daemon

```bash
npm run dev:server
```

---

## Two-Process Dialog Architecture (Agent Daemon + User CLI)

You can run the dialog agent as a background worker in one terminal, and interact with it from a human chat CLI in another terminal:

### Terminal 1: Run the Dialog Agent Daemon
```bash
npm run agent:dialog
# or: npm run cli:agent dialog_playground
```
*The agent loop boots the Curator host in the background, executes turns, and pauses in `WAITING_FOR_USER` whenever it needs input.*

### Terminal 2: Run the User CLI Client to Communicate
```bash
npm run chat
# or: npm run cli:chat
```
*The CLI discovers the active conversation, displays the agent's prompt, takes user input from the terminal, records the response in SQLite, and prints the agent's output in real time.*

---

## Runnable Code Examples

```bash
# Direct in-process tool execution & MCP schema inspection
npm run example:tool

# Programmatic interactive dialog loop turn simulation
npm run example:dialog

# Dynamic CoffeeScript agent compilation & pipeline execution
npm run example:coffee

# Natural CoffeeScript Verbs & Automatic Execution AST Generation
npm run example:coffee-verbs

# Model Context Protocol (MCP) server & client invocation
npm run example:mcp

# Real-time Host lifecycle events & topic streaming
npm run example:events

# Distributed P2P Mesh & Multi-Agent Ping-Pong Harness
npm run example:p2p

# Side A: Background Dialog Agent Daemon
npm run agent:dialog

# Side B: User CLI Chat Client
npm run chat
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

