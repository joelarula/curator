# Curator Module

This module contains the standalone parallel agentic engine (`AdkRequestProcessor`), built around the Google ADK. It decouples agent execution and AST processing from the legacy `server` module, allowing workflows to run against its own local, minimal database schemas (like SQLite WASM extensions) or shared remote Postgres databases.

## The Full Concept: Database-Driven Parallel Agentic Application

The overarching goal is to **revamp the legacy cursor server** into an ADK-driven application:

1. **Dynamic AST Workflows**: Instead of running hardcoded routines in memory, users or systems insert new workflows directly into the `Request` table. These workflows are serialized as Abstract Syntax Trees (ASTs). The `AdkRequestProcessor` watches this table and executes them dynamically.
2. **Hybrid Execution Nodes**: While this module executes `ADK_Agent` nodes, traditional nodes (such as `Sequence`, `ForEach`, and `Spawn`) can be retained in the legacy server project, or migrated to run concurrently within this engine.
3. **Subagent Spawning**: The engine natively supports spawning subagents. These can be securely isolated within standard `AdkSession` entries or attached to dedicated `Conversation` entities for persistent UI tracking.
4. **Local and Edge Ready**: Because the concurrency mechanism uses atomic database updates (`updateMany`) instead of specific row locks, the engine runs flawlessly on desktop-grade SQLite instances without sacrificing parallel execution logic.

## ADK Request Processor Architecture

1. **Standalone Engine (`AdkRequestProcessor.ts`)**
   - Polls the `Request` table for `NEW` tasks.
   - Safely acquires tasks using an atomic Prisma `updateMany` loop to prevent concurrent worker collisions (fully compatible with SQLite and Postgres).
   - Instantiates Google ADK `Runner` natively, feeding it the prompt dynamically retrieved from the database AST format (`{ type: "ADK_Agent", agentName: "TestAgent", ... }`).
   - Automatically stores the generated output directly into the `Response` table.
   - Handles retries on failure (e.g., API errors) to ensure fault tolerance.

2. **Schema Separation (`schema.prisma`)**
   - Includes minimal `User`, `Conversation`, `Request`, and `Response` models alongside standard ADK sessions.
   - The engine uses this schema to orchestrate local workflows fully independent of the legacy monolithic server. 

## Command Line Tool (`cli.ts`)

The module includes a robust CLI for executing agent scripts, registering plugins, and orchestrating local databases.

> [!WARNING]
> You **must** be inside the `curator/curator` directory (the Rust/Agent module folder) to run these scripts properly, **not** the workspace root!

### Executing Scripts

You can execute agent/tool scripts (which return an ADK AST) synchronously using the `cli` command. This will spin up a transient worker that blocks until the response is ready:

```powershell
cd curator
npm run cli -- scripts/test_process_feed.ts --db test_db --session my_unique_trial
```

**Options:**
- `--db <name>`: Automatically provisions or connects to the `name.db` SQLite database (e.g. `test_db` connects to `data/test_db.db`).
- `--session <id>`: Specifies the conversational session boundary for the Request (defaults to `cli_session`).
- `--reset`: Force resets (deletes) the SQLite database before running for a pristine test environment.

### Starting the Daemon

If you want to boot up the persistent request workers and the background cron Agent Scheduler, you can start the `serve` daemon. This runs with `tsx watch` enabled, so it will hot-reload on file changes:

```powershell
cd curator
npm run serve -- --db default
```

### Seeding Test Databases

We also provide a standalone script for hydrating a fresh Semantic Graph database with schemas and sample entities without relying on the legacy server:

```powershell
cd curator
npm run cli -- scripts/seed_test_db.ts --db test_db
```

### Raw `tsx` Execution (Alternative)

If you prefer to bypass `npm` entirely or are integrating this into another system, you can invoke the CLI natively using `npx tsx`:

```powershell
# Set your API key in your environment or rely on the .env file
$env:GEMINI_API_KEY="your_api_key"

# Using the CLI natively
npx tsx src/bin/cli.ts run scripts/test_process_feed.ts --db test_db --session my_unique_trial --reset
```
