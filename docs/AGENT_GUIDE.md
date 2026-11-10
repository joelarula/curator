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
- Access is granted to roles only (never to a user directly) and is allow-list only: `AccessService.canUse(actor, 'tool' | 'agent' | 'secret', name)` for calls and listings. A role given in a project counts in its sub-projects unless a `ProjectRole` list narrows it; an agent acting for a user gets only what both may do. Errors deny. There is no `Permission` / `RolePermission` table (dropped).
- In GraphQL resolvers, utilize `buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId)` inside Prisma `where` blocks. Do not expose active project context in query signatures.
- For local SQLite WASM environments (e.g. Chrome Extension), multiple project databases are abstracted as standard GQL projects. The background worker maps standard GQL queries directly to the correct SQLite database file.

### 4.5 Formal AST-Only Execution Schema

- The `Request` and `Response` database tables execute workflows exclusively via the **Formal Execution AST** (`ast` field) and state mapping environment (`context`).
- All legacy flat pipeline columns (`toolCalls`, `toolArgs`, `callbacks` on `Request` / `Response`) are deleted from both PostgreSQL and SQLite schemas.
- Whenever dynamic scripts or sequential commands are submitted/run, they must compile using `compileToAST` (or `compileCoffeeScriptToAST`) into the structured AST JSON format before creating database request tasks.
- The execution processor (`RequestProcessor` / `CuratorRequestProcessor`) polls for new requests and recursively executes the compiled nodes (`Sequence`, `ForEach`, `IfElse`, `Spawn`, `While`, `ToolTask`).

#### Direct Invocations, MCP, and Derived Audit Trail:
- **Direct Tools & MCP as Requests**: CLI, REPL, API, and MCP tool executions never invoke handlers directly. They are queued as lightweight `Request` records with appropriate `origin` (`'CLI' | 'REPL' | 'API' | 'MCP' | 'GRAPHQL'`) and yield `Response` records.
- **Approval Wait Expiry**: Approval-required tool requests support `approvalTtlMs` and `onApprovalExpired: 'fail' | 'continue'`. Expired requests are processed in polling cycles with `APPROVAL_EXPIRED` structured responses.
- **Model Change Audit Trail**: Core model mutations (Agents, Roles, Tool Approvals) are recorded via `AuditService.recordModelChange` into `Request` and `Response` tables (`type: 'MODEL_CHANGED'`), eliminating the need for a separate `AuditLog` table.


#### AST Context & Session Execution Guarantees
Curator Core automatically maintains context, turn state, and database response logs across workflow executions:

```coffeescript
# Curator Core automatically maintains context, turn state, and database response logs
while_loop "$context.turn <= 5",
  seq [
    wait_event "game:ping"
    set_state turn: "$context.turn + 1", score: "$context.turn * 10"
    emit_event "game:pong", turn: "$context.turn", sender: "alpha"
  ]
```

When this runs, `CuratorRequestProcessor` guarantees:
1. `$context.turn` and state are committed to the database after each step.
2. `Response` records are created per step automatically (there is no `AuditLog` table; the audit view is derived from Responses via `AuditService.getLogs`).
3. Peer sessions and token permissions are validated against the database.

#### Every tool call and event is a Request
- CLI, REPL, ClientShell and API paths must not call tool functions (`runAsync` / `execute`) directly. Use `host.runTool(name, args, { origin })` → `CuratorRequestProcessor.runToolRequest`, and `host.emitEvent(name, payload, opts)` → `emitEventRequest` (one matcher, `dispatchEvent`, for subscriptions and waits).
- Actor and scope (user, project, conversation) come from the host session, never from client payloads.
- Scripts are stored as immutable `ScriptVersion` rows (idempotent by AST hash); Requests reference `scriptId` + `scriptVersion` (+ `context.astPath`) instead of copying the AST, unless the host uses `astStorage: 'snapshot'`.

### 4.6 Multi-Database Schema Topology and Isolation Rules

The repository intentionally supports multiple database engines across modules:

1. **`server/prisma/schema/` (PostgreSQL with `pgvector`)**:
   - The primary enterprise backend for GraphQL, Apollo Server, OAuth/RBAC, and semantic vector embeddings.
   - Utilizes PostgreSQL-specific native features (`vector(1536)`).
2. **`curator/prisma-sqlite/` (SQLite)**:
   - Powers `@curator/agent-server`, standalone desktop CLI runs (`curator run --db <name>`), offline agents, and WASM/OPFS client edge runtimes (e.g. Chrome extension, Keeris).
   - Stripped of PostgreSQL-specific native modifiers and vector extensions so it runs without Docker or external DB services.
3. **`curator/prisma-mariadb/` (MySQL / MariaDB)**:
   - Used for cPanel and shared-hosting deployments where PostgreSQL/Docker are unavailable.
4. **`server/prisma/sqlite/` (Server SQLite replica)**:
   - Maintained for local SQLite execution paths and testing within `server`.

#### Strict Isolation Rules for Prisma Schemas:
- **Never co-locate multiple engine schemas under the same `prisma/` folder**: Prisma Language Server automatically treats any `.prisma` files in the same directory tree as a single multi-file schema. Placing SQLite, MariaDB, or Postgres schemas in the same `prisma/` folder causes fatal duplicate model collisions (`The model "Project" cannot be defined because a model with that name already exists`).
- Separate distinct database targets into their own root folders (e.g., `prisma-sqlite/`, `prisma-mariadb/`).
- **Core Entity Synchronization**: When updating core workflow models (`Project`, `User`, `Agent`, `Request`, `Response`, `Conversation`), the changes must be intentionally synced across both PostgreSQL (`server/prisma/schema/core.prisma`) and embedded runtimes (`curator/prisma-sqlite/` and `curator/prisma-mariadb/`).
- **Client Output & TypeScript Path Mapping**: Submodules using custom output generators (e.g., `src/generated/prisma-sqlite`) must map `@prisma/client` in `tsconfig.json` paths so local services maintain full type safety without relying on hoisted root stubs.

### 4.7 Contract-Based MiniApp & MiniGame Architecture and Package Boundaries

MiniApps (`miniapps/*`) and MiniGames (`minigames/*`) must be developed as modular guest extensions to the Curator host, not as coupled forks of the core engine.

#### 1. Stable Application Contracts (`@curator/host/contracts`)
- **No Engine Coupling**: MiniApps and MiniGames must never construct `CuratorEngine` or wire internal SQLite provisioners manually. Instead, they define their tools, state reducers, and domain metadata via formal contracts:
  - `defineMiniGame({ manifest, roles, reducers, tools, events, commands })`
  - `defineMiniApp({ manifest, roles, tools, reducers, events })`
- **Capabilities & Backward Compatibility Handshake**: The application manifest (`CuratorAppManifest`) declares domain identity, version, and required host features (`requiredHostCapabilities: ['ast:v2', 'channel:repl', 'storage:sqlite']`). This enables the host runtime to negotiate capabilities and provide adapter shims when the core engine evolves, preserving backward compatibility without freezing core development.
- **Hexagonal Ports & Adapters**: Core engine developers are free to refactor AST compilation, request processing, and storage SPI layers. MiniApps only interact with the Host Facade Port.

#### 2. Strict Package Boundaries & Subpath Exports
- **No Monorepo Escapes**: Never import across package boundaries using relative directory paths into sister packages or dist folders (e.g. `../../../packages/host/dist/appConfig.js` is strictly forbidden). Always import via package names (`@curator/host`, `@curator/mcp-server`).
- **Explicit Subpath Exports**: Upstream packages must define explicit entry points in `package.json` (`exports: { ".", "./config", "./contracts", "./client" }`) and remove wildcard leaks (`"./*": "./dist/*"`).
- **Index-Based Public Barrels**: Domain modules must provide curated public barrel files (`index.ts`). Internal files (e.g. `pokerContracts.ts`, `pokerEvents.ts`, `pokerContext.ts`) should be consumed through `models/index.ts` rather than fragmented deep relative paths.
- **Lightweight Configuration Subpaths**: When CLI boot or configuration loading only requires environment variables or app settings, import exclusively from `@curator/host/config` to avoid loading Express, WebSockets, or heavy server dependencies.

### 4.8 Runtime Guardrails, Application Boundaries & Least-Privilege IAM

Curator Core (`@curator/agent-server`) enforces defense-in-depth across ingress, tool execution, egress, infrastructure, and secret management via `GuardrailService` (`curator/src/services/GuardrailService.ts`) and `SecretService` (`curator/src/services/SecretService.ts`).

#### 1. Deterministic Ingress Filters & Prompt Injection Gate
- **Schema Validation & Input Truncation**: `Curator_Agent` nodes validate `input_schema` via Ajv and pass all interpolated prompts through `GuardrailService.inspectPromptIngress` prior to model invocation, stripping control-character/bidirectional-override smuggling and truncating inputs exceeding `CURATOR_MAX_PROMPT_CHARS` (default `100,000`).
- **Deterministic Regex & Delimiter Spoofing Filters**: Prompts containing model control delimiters (`<|im_start|>`, `[INST]`, `<<SYS>>`) or direct instruction-override patterns are blocked before reaching the LLM and tagged with MITRE ATLAS `AML.T0051`.
- **Gateway Guardrail Providers**: External evaluation suites (Llama Guard, NeMo Guardrails, Promptfoo) integrate via `GuardrailService.registerProvider(provider)`, a plugin's `guardrails.providers`, or `CURATOR_GUARDRAIL_URL`.
- **Provider hooks around model calls** (`IGuardrailProvider`): `evaluateIngress` (prompt check), `inlet(request, ctx)` / `outlet(response, ctx)` on every model call of an agent turn (return a changed value, nothing, or `{ blocked: true, reason }`), and `sanitizeEgress(text)` on the agent's final output. `priority` orders providers (lower first, default 100); `appliesTo` limits them to agent names/globs. Built-in checks run first on ingress and the built-in masking runs last on egress. Hooks cannot add tools or tool calls, or change model/endpoint/credentials (restored). A blocking or throwing inlet/outlet hook (fail closed) records a `GUARDRAIL_BLOCKED` Response (`metadata: { provider, stage }`).

#### 2. Secure Agentic & MCP Tool Calling
- **No Raw Text Execution for Agents**: Tools granting raw shell/eval/SQL execution (`eval`, `exec`, `shell`, `bash`, `powershell`, `cmd`, `raw_sql`, etc.) are automatically stripped from agent tool-calling and MCP plugins (`GuardrailService.isRawExecutionTool`, tagged `AML.T0040`).
- **Strict JSON Schema Parameter Validation**: All agentic tool invocations and MCP tool calls validate arguments against `tool.parameters` via `GuardrailService.validateToolParameters` (Ajv) before invoking `runAsync` or MCP `callTool`.
- **Sandboxed Execution**: Inline VM tools and script nodes execute with `codeGeneration: { strings: false, wasm: false }`, strict execution timeouts (`5000ms`), and network access disabled by default (`CURATOR_ALLOW_INLINE_TOOL_NETWORK` off).

#### 3. Egress & Output Sanitization
- **Automatic PII/PCI-DSS & Secret Redaction**: All model responses and tool outputs pass through `GuardrailService.sanitizeModelOutput`, combining `SecretService.mask` (hydrated secrets, GitHub/OpenAI/Bearer tokens) with `GuardrailService.redactPiiAndPci` (Luhn-validated PCI-DSS payment card numbers `[REDACTED:PCI_PAN]`, SSNs `[REDACTED:PII_SSN]`, PEM private keys, AWS/GCP keys, JWTs, and configurable email/phone redaction).
- **Untrusted Output Escaping**: All model output must be treated as untrusted user input. Use `GuardrailService.escapeHtml` / `stripUnsafeHtml` before HTML rendering, `GuardrailService.escapeShellArg` before shell boundaries, and parameterized queries (`sqlFor` / Prisma) or `GuardrailService.escapeSqlLiteral` / `escapeSqlIdentifier` before database boundaries.

#### 4. Infrastructure Hardening & Scoped Short-Lived Secrets
- **Isolated Model & Vector Endpoints**: LLM providers (`OpenAiCompatibleLlmProvider`, `AnthropicLlmProvider`) validate `baseUrl` via `GuardrailService.validateEndpointUrl`, blocking SSRF to cloud metadata services (`169.254.169.254`, `metadata.google.internal`) and enforcing `CURATOR_ALLOWED_LLM_HOSTS`. Containerized inference engines (`llamacpp`, `curator-rust`) run as unprivileged non-root users (`10001:10001`) with `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges:true`, and internal-only Docker bridge networks.
- **Scoped, Short-Lived Secrets**: Static API keys are never hardcoded in repositories (`SecretService` derives master keys from `CURATOR_SECRET_KEY` or per-process CSPRNG). Agent sessions use TTL-bound, agent/conversation/project-scoped tokens via `SecretService.registerEphemeralSecret` and pluggable dynamic secret providers (`SecretService.registerVaultProvider` for HashiCorp Vault / IAM / Workload Identity Federation).


## 5. Module-by-module run and validation commands

## Root

Install and run combined app:

```powershell
pnpm install
pnpm run dev
```

(or legacy `npm run install:all && npm run dev`)

## Server

```powershell
pnpm --filter @curator/backend run dev
pnpm --filter @curator/backend run build
pnpm --filter @curator/backend run test
pnpm --filter @curator/backend run prisma:generate
pnpm --filter @curator/backend run prisma:migrate
pnpm --filter @curator/backend run db:push
```

CLI tooling:

```powershell
pnpm --filter @curator/backend run curator -- --help
```

## Frontend

```powershell
pnpm --filter @curator/frontend run dev
pnpm --filter @curator/frontend run build
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
- To see the exact request an agent sent to a model (system prompt, messages, tools, response), use the LLM trace: `docs/LLM_DEBUGGING.md`.

## 8. Multi-module change policy

When a task spans modules, keep commits logically grouped by dependency order:

1. Contracts and shared types
2. Server implementation
3. Client integration
4. Docs and examples

Avoid mixing unrelated refactors into feature changes.

### 8.1 Mandatory rebuild of changed dependencies
- **Always build changed dependencies**: When modifying contracts, interfaces, models, or types in an upstream/shared package (e.g. `packages/host`, `curator`, `packages/plugin-auth`), **immediately compile that package** (`npm --prefix <package> run build` or `tsc`) before testing or consuming it in downstream modules (`minigames/*`, `miniapps/*`, `server/`).
- **Prevent `dist/` and declaration desync**: Downstream modules that import from compiled bundles or declaration files (`dist/index.js`, `dist/types.d.ts`) will fail typechecks or execute stale code if the upstream package's build outputs are not regenerated immediately upon modification.

## 9. Editing and safety rules

- Prefer minimal diffs.
- Do not reformat unrelated files.
- Do not change generated output files unless task requires it.
- Do not modify backup/ except explicit archival tasks.
- Preserve existing public APIs unless change request requires API break.

## 10. Validation checklist before handoff

For any non-trivial change, run all that apply:

- Changed module compiles (`tsc` / fast type-check)
- Modified upstream packages (`packages/host`, `curator`, etc.) rebuilt (`npm run build`) so `dist/` types are fresh
- Targeted unit check or one-shot command verifies the specific behavior touched
- Tool registrations match manifest and handler implementation
- Docs updated for new externally-used behavior
- No accidental edits in unrelated modules

### 10.1 Targeted testing policy & avoiding heavy suite runs
- **Focus on targeted tests**: Never run full multi-suite test runners (`npm test`, integration suites) after simple code changes or minor iterations. Full suites boot multiple servers, WebSockets, and run heavy simulation loops taking 60–90+ seconds.
- **Fast verification over heavy suites**: Prioritize ultra-fast static verification (`tsc --noEmit` or build ~2-3s) and pinpoint one-shot commands (e.g. running a single CLI action or querying SQLite tables in 200ms).
- **Always ask before running potentially long commands**: If a command, script, or test suite is expected or likely to take more than ~15 seconds, **always ask the user first** before executing it. This empowers the user to decide whether to run it themselves in their own terminal or skip it, avoiding wasting agent execution time and blocking developer momentum.

Minimum expected reporting in handoff:
- what changed
- why changed
- how validated
- known limitations or follow-up items

## 11. Common pitfalls to avoid

- **Forgetting to rebuild upstream dependencies**: Modifying types or contracts in `packages/host`, `curator`, or shared packages without running `npm run build` leaves `dist/` out of sync, triggering phantom type errors (e.g. `Object literal may only specify known properties, and '...' does not exist in type '...'`) in dependent miniapps and minigames.
- **Running full integration test suites after simple changes**: Avoid executing long-running test suites without asking the user first. Use fast targeted verification.
- Adding a tool handler but forgetting manifest entry
- Adding manifest entry but forgetting registry mapping
- Relying on TypeScript augmentation for runtime behavior in scripts
- Assuming backup docs match active schema
- Hardcoding local URLs instead of honoring configured env values
- Shipping frontend integration without confirming server response shape
- **Static imports in CLI entry points (`src/cli.ts`)**: In ECMAScript Modules (ESM), static `import` statements are hoisted and evaluated *before* any runtime code executes. In network/SMB workspace setups, statically importing servers/clients freezes startup for 30–45s before even line 1 can log. Keep top-level CLI entry points ultra-lean (`commander` only) and dynamically load heavy dependencies (`await import(...)`) inside `.action(...)` handlers.
- **Using tsx loader instead of native Node for CLI scripts**: Node 22.5+ and Node 24 natively strip and run TypeScript files (`node src/cli.ts`), exactly as proven in `miniapps/keeris/package.json` (`"scrape": "node src/cli.ts scrape"`). Avoid wrapping scripts with external loader flags (`node --import .../tsx/...`).
- **Bypassing package boundaries with relative `dist/` imports**: Importing `../../../packages/host/dist/...` couples apps to internal folder layouts and breaks packaging/bundling. Always use `@curator/host` or subpath exports (`@curator/host/config`).
- **Leaky package exports (`./*`)**: Exposing `"./*": "./dist/*"` in `package.json` allows consumers to depend on private engine classes. Use explicit subpaths (`.`, `./config`, `./contracts`, `./client`).
- **Fragmented internal file imports**: Bypassing domain barrel files (`index.ts`) by importing directly from `../models/someInternalFile.ts` causes brittle refactoring breaks. Use index exports.
- **Wildcard barrel sprawl (`export * from '...'`)**: Using unrestricted `export *` in domain `index.ts` files accidentally exposes volatile internal helpers as public contract symbols. Refactoring or deleting an internal file then silently breaks external consumers and test suites. Use explicit named exports.
- **Reinventing Host shell services in MiniApps**: Implementing custom local user identity, TTY prompts, and JSON file stores (e.g. `pokerProfile.ts`) inside miniapps fragments identity logic. Always use `@curator/host` identity providers (`resolveClientIdentity`, `createClientShell`).

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

## 15. Contract-based MiniApp & MiniGame Architecture

To enable rapid core development in `@curator/agent-server` and `@curator/host` without breaking downstream consumers (`miniapps/*`, `minigames/*`), follow the **5-Pillar Contract Architecture**.

### 15.1 Diagnosis: Root Causes of Downstream Fragility
1. **Leaky Boundary Surfaces (Barrel `export *` Sprawl)**: When domain `models/index.ts` files do wildcard exports (`export * from './pokerGuards.ts'`), internal helpers become implicit public APIs. Moving or removing them breaks downstream tests and external consumers.
2. **Deep and Direct File Coupling**: Reaching into internal relative engine paths (`../../packages/host/dist/...` or `@curator/agent-server/src/...`) couples downstream apps to internal directory layouts.
3. **Core Shell Features Invented in MiniApps**: Reinventing client identity resolution, prompt handling, and local profile storage inside games (e.g. `pokerProfile.ts`) duplicates logic and creates inconsistencies across apps.
4. **Abrupt Deletions**: Deleting public symbols without warning immediately breaks consumers that rely on them.

### 15.2 The 5-Pillar Architectural Guidelines

#### Pillar 1: Promote Shell & Identity Logic into `@curator/host` (`HostProfileProvider`)
- Identity resolution (CLI flags `--name`, stored profiles `~/.curator/identities/<appId>.json`, interactive TTY prompts, deterministic `user_${slug}` actor IDs) belongs in `@curator/host`.
- MiniApps configure options on `createClientShell` or `resolveClientIdentity`; they must **never** build ad-hoc JSON storage or custom readline prompt loops.

#### Pillar 2: The Contract Boundary Pattern
- Downstream apps develop against pure contracts (`@curator/host/contracts`, `@curator/host/client`).
- Core internals (Prisma models, SQLite low-level provisioners, AST compiler internals, internal execution routers) must never be imported into MiniApps/MiniGames.
- Barrels must explicitly declare exported symbols:
  ```typescript
  // DO: Explicit named exports
  export { PokerTableShape, PokerBankrollShape } from './pokerShapes.ts';
  export { isCard, isStreet } from './pokerGuards.ts';

  // DON'T: Wildcard export that accidentally publishes internal refactoring churn
  export * from './pokerGuards.ts';
  ```

#### Pillar 3: Schema-First Transport Protocols
Communication between Host, Channel, and MiniApp REPL happens over 4 standardized message envelopes:
1. **`EventIntent`**: `{ type, payload, conversationId, requestId }` — intent from Actor/User into Engine.
2. **`ChoicesPrompt`**: `{ prompt, choices: [{ id, label, action, amount }], blocking }` — engine choice request to Actor.
3. **`ToolExecution`**: `{ tool, args, conversationId }` — direct tool invocation boundary.
4. **`SpeechMessage`**: `{ text, speaker, speechAct, targetId }` — conversational or ambient chatter.

Because this wire protocol is standardized, Core can refactor AST execution, subroutines, or storage without breaking client channels.

#### Pillar 4: Deprecation Shims & Facades (No Abrupt Deletions)
- When public symbols, types, or guards are moved or replaced (e.g., relocating `isCard` from `pokerGuards.ts` to `engine/pokerRules.ts`):
  - **Never delete the old file immediately**.
  - Retain the old file as a 1-release re-export shim with `@deprecated` JSDoc annotations:
    ```typescript
    /** @deprecated Import directly from '../engine/pokerRules.ts' or '../models/pokerContracts.ts' */
    export { isCard, isStreet } from '../engine/pokerRules.ts';
    ```
- This allows existing tests and downstream consumers to transition without immediate breakage.

#### Pillar 5: Downstream Contract Verification Suite
- Verify public contract compliance using targeted static checks (`tsc --noEmit`) across all modules.
- Ensure that public tool registrations, workflow AST shapes, and event definitions conform to the Host contracts before committing changes to Core.
