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

The module includes a robust CLI for executing agent scripts and orchestrating local databases.

### Usage

```powershell
npx curator-agent run <script-path> [--db <name>] [--reset]
```

### Features

- **Dynamic Provisioning**: Passing `--db test_adk` will automatically provision a local `test_adk.db` SQLite database and sync the `schema.prisma`.
- **Force Resetting**: Passing `--reset` clears out old artifacts to ensure a pristine test run.
- **Environment Mapping**: It actively pulls environment variables from `.env` and normalizes API keys (e.g., mapping `GOOGLE_API_KEY` directly to `GEMINI_API_KEY` for the ADK).
- **TypeScript & CoffeeScript**: Automatically transpiles and executes scripts that export a `run()` hook with the injected `PrismaClient`.

### Testing the Engine

To run the standalone integration test script manually:

```powershell
# Set your API key in your environment or rely on the .env file
$env:GEMINI_API_KEY="your_api_key"

# Using the raw wrapper
npx tsx run_test.ts

# OR using the CLI
npx tsx src/bin/cli.ts run scripts/test_adk_processor.ts --db test_adk --reset
```
