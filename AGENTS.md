# AGENTS.md

Comprehensive agent instructions for the Curator multi-module repository.

## 1. Mission and scope

This repository is a multi-module workspace combining:
- a Node.js backend (GraphQL + scripting + tool orchestration)
- a Vue frontend
- a Rust local-LLM service
- a standalone llama.cpp Docker setup
- browser and editor extensions
- utility visualization apps

Agent goal:
- make correct, minimal, module-aware changes
- preserve existing architecture and conventions
- validate changes in the module you touched
- avoid cross-module regressions

## 2. Repository map (active modules)

- Root
  - Workspace orchestration, top-level dev scripts, Docker Compose for main stack.
- server
  - Main backend service.
  - GraphQL API, tool registry, script runner, request processor, Prisma schema and seeds.
- frontend
  - Vue 3 + Vite app for Curator UI.
- curator
  - Rust crate for local LLM bridge using llama-cpp-v3.
  - Exposes API endpoints compatible with local inference workflows.
- llamacpp
  - Isolated llama.cpp server Docker runner and tuning docs.
- chrome-extension
  - Browser extension module.
- curator-vscode-plugin
  - VS Code extension module.
- prisma-erd-visualizer
  - Dev utility app for ERD visualization.
- backup
  - Legacy/reference content. Do not treat as source of truth for new runtime behavior.

## 3. Source-of-truth conventions

When documents conflict, prioritize in this order:
1. Current code in active modules
2. Module-local README and scripting docs
3. Root-level docs
4. backup documents

Do not implement new behavior based only on backup content.

## 4. Architecture principles

### 4.1 Server-first orchestration

- The server module is the orchestration core.
- Tools are registered in a central registry and dispatched by name.
- Script execution compiles/evaluates into tool call chains.
- Curator fluent builder methods are generated from the tool manifest.

### 4.2 Tool lifecycle

Any new tool should be integrated consistently:
1. Implement handler under server/src/services/tools/
2. Register in server/src/services/ToolRegistry.ts
3. Add name to server/src/services/tools/manifest.ts
4. Add input types in server/src/services/tools/types.ts
5. Document behavior in server/SCRIPTING.md if publicly usable in scripts

### 4.3 Data flow mindset

Prefer this change order for feature work:
1. Data model and schema implications
2. Server APIs and tool contracts
3. Frontend consumption
4. Extensions and external clients

### 4.4 Unified Project Scoping Rule

- Database entities (Resources, Relations, Texts, Agents, Scripts, Conversations, Requests, Responses) must always be queried and updated within the scope of the **active project IDs** plus the global `'system'` project.
- Active project IDs are resolved dynamically on the backend (passed as a header list `x-project-id` or loaded from the user's session record `Session.activeProjectId`).
- In GraphQL resolvers, utilize `buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId)` inside Prisma `where` blocks. Do not expose active project context in query signatures.
- For local SQLite WASM environments (e.g. Chrome Extension), multiple project databases are abstracted as standard GQL projects. The background worker maps standard GQL queries directly to the correct SQLite database file.

### 4.5 Formal AST-Only Execution Schema

- The `Request` and `Response` database tables execute workflows exclusively via the **Formal Execution AST** (`ast` field) and state mapping environment (`context`).
- All legacy flat pipeline columns (`toolCalls`, `toolArgs`, `callbacks` on `Request` / `Response`) are deleted from both PostgreSQL and SQLite schemas.
- Whenever dynamic scripts or sequential commands are submitted/run, they must compile using `compileToAST` into the structured AST JSON format before creating database request tasks.
- The execution processor (`RequestProcessor`) polls for new requests and recursively executes the compiled nodes (`Sequence`, `ForEach`, `IfElse`, `Spawn`, `While`, `ToolTask`).

## 5. Module-by-module run and validation commands

## Root

Install and run combined app:

```powershell
npm run install:all
npm run dev
```

## Server

```powershell
npm --prefix server install
npm --prefix server run dev
npm --prefix server run build
npm --prefix server run test
npm --prefix server run prisma:generate
npm --prefix server run prisma:migrate
npm --prefix server run db:push
```

CLI tooling:

```powershell
npm --prefix server run curator -- --help
```

## Frontend

```powershell
npm --prefix frontend install
npm --prefix frontend run dev
npm --prefix frontend run build
```

## Rust LLM bridge (curator)

```powershell
cargo check --manifest-path curator/Cargo.toml
cargo run --manifest-path curator/Cargo.toml
cargo run --manifest-path curator/Cargo.toml -- serve --port 8080
```

## llama.cpp Docker runner

```powershell
cd llamacpp
docker compose up -d
docker compose logs -f llama-server
```

## Chrome extension

```powershell
npm --prefix chrome-extension install
npm --prefix chrome-extension run build
npm --prefix chrome-extension run watch
```

## VS Code extension

```powershell
npm --prefix curator-vscode-plugin install
npm --prefix curator-vscode-plugin run compile
```

## Prisma ERD visualizer

```powershell
npm --prefix prisma-erd-visualizer install
npm --prefix prisma-erd-visualizer run dev
npm --prefix prisma-erd-visualizer run build
```

## 6. Script engine guidance (server)

- Scripts execute in sandboxed VM context.
- Prefer tool orchestration over embedding business logic in script text.
- Keep scripts deterministic and composable.
- Use placeholders for runtime binding instead of hardcoded outputs.

For scripts that call local LLM endpoints, use dedicated llama tools where available.
For unsupported llama endpoints, use the generic llama_request tool.

## 7. LLM and llama.cpp guidance

There are two local LLM paths:

1. Rust bridge service in curator/
- Own API surface and model lifecycle.
- Suitable when integrating with Curator-local runtime settings endpoints.

2. Upstream llama.cpp server in llamacpp/
- Dockerized runner with broad endpoint support.
- Use environment-driven server argument configuration.

Agent rules:
- Do not hardcode model paths where env variables already exist.
- Keep sampling and endpoint assumptions explicit.
- Verify endpoint compatibility before wiring UI assumptions.

## 8. Multi-module change policy

When a task spans modules, keep commits logically grouped by dependency order:

1. Contracts and shared types
2. Server implementation
3. Client integration
4. Docs and examples

Avoid mixing unrelated refactors into feature changes.

## 9. Editing and safety rules

- Prefer minimal diffs.
- Do not reformat unrelated files.
- Do not change generated output files unless task requires it.
- Do not modify backup/ except explicit archival tasks.
- Preserve existing public APIs unless change request requires API break.

## 10. Validation checklist before handoff

For any non-trivial change, run all that apply:

- Changed module compiles
- Targeted tests pass or are reported not run
- Tool registrations match manifest and handler implementation
- Docs updated for new externally-used behavior
- No accidental edits in unrelated modules

Minimum expected reporting in handoff:
- what changed
- why changed
- how validated
- known limitations or follow-up items

## 11. Common pitfalls to avoid

- Adding a tool handler but forgetting manifest entry
- Adding manifest entry but forgetting registry mapping
- Relying on TypeScript augmentation for runtime behavior in scripts
- Assuming backup docs match active schema
- Hardcoding local URLs instead of honoring configured env values
- Shipping frontend integration without confirming server response shape

## 12. Preferred implementation style

- Keep functions small and composable.
- Fail fast on invalid inputs.
- Return structured errors where possible.
- Use explicit names over implicit behavior.
- Add concise comments only where behavior is not obvious.

## 13. If unsure where a change belongs

Decision shortcut:

- Data model mismatch -> server/prisma first
- Request handling or orchestration -> server
- Rendering and UX -> frontend
- Local inference runtime internals -> curator (Rust)
- Upstream llama server deployment/tuning -> llamacpp
- Editor-specific UX -> curator-vscode-plugin
- Browser-specific UX -> chrome-extension

When uncertain, document assumptions in the handoff and isolate the change to the most probable module.

## 14. Recommended baseline for new features

1. Write or update contract (types, schema, tool input)
2. Implement server behavior
3. Add script-level or API-level usage example
4. Integrate frontend
5. Add concise docs update
6. Validate with targeted build/test commands

Following this sequence keeps cross-module behavior predictable and easier to debug.
