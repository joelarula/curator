# Keeris MiniApp Rules & Architecture

## Core Mental Model
1. **Curator Host (`@curator/host`, `@curator/agent-server`) orchestrates the miniapp:**
   - Manifest declared with `defineMiniApp` in `src/contracts/keerisApp.ts` and `src/contracts/manifest.ts`.
   - Supports AST v2 workflows, unified SQLite / MariaDB storage, and multiple transport channels (`channel:direct`, `channel:repl`, `channel:websocket`).
2. **Direct Mode REPL Client (`src/client/keerisClientShell.ts`, `src/client/keerisClient.ts`):**
   - Declarative shell built on `createClientShell` and `createDirectChannel` from `@curator/host/client`.
   - In-process execution boots `createKeerisHost()` without needing an external WebSocket server or extra ports.
   - Background crawl events are received asynchronously through the channel and formatted via `printAbove` so user prompts remain undisturbed.
3. **Decoupled Contracts, Shapes & Models (`src/models/`):**
   - `keerisContracts.ts`: Canonical role (`KeerisRole`), tool (`KeerisTool`), event (`KeerisEvent`), and module (`KeerisModule`) constants.
   - `keerisQueries.ts`: Canonical GraphQL queries isolated from UI components to eliminate circular dependencies.
   - `keerisShapes.ts`: TypeScript contracts for catalog records (`TrackRecord`, `AiringRecord`, `CatalogStatsRecord`) and tool I/O (`TrackSearchInput/Output`, `TriggerAgentInput/Output`, etc.).
   - `keerisGuards.ts`: Runtime type guards for tool input validation.
4. **Type-Safe Tools & RBAC (`src/plugins/`):**
   - Defined with `CuratorToolDefinition` in `keerisTools.ts` with explicit `requiredRole` (`KeerisRole.VIEWER` for read tools, `KeerisRole.CURATOR` for mutation tools).
   - Registered in `keerisPlugin.ts` alongside role hierarchies (`KeerisRole.CURATOR` inherits `KeerisRole.VIEWER` and `CuratorSystemRole.USER`).
5. **Compiled AST Workflows (`src/workflows/`):**
   - Composable AST step builders in `keerisComposables.ts` (`discoverEpisodesStep`, `processEpisodeStep`, `scrapeSingleStep`, `forEachEpisode`).
   - Pure AST generators in `keerisWorkflows.ts` (`buildPipelineScrapeAST`, `buildRescrapeMissingAST`, `buildSingleScrapeAST`, `KEERIS_WORKFLOW_ASTS`).

## Conventions
- **No Direct Tool Invocations:** Workflows, clients, and tests must invoke tools through `host.runTool` or step transitions, never by calling `tool.execute` directly.
- **AST Workflows Only:** Never use legacy callback loops or imperative scraper runners; all agentic scraping operations execute as compiled AST v2 graphs.
- **UI Decoupling:** Never import terminal UI code (`blessed`, `chalk`, `cli.ts`) into `src/models/`, `src/contracts/`, `src/plugins/`, or `src/workflows/`.
- **Database Isolation:** When running in local SQLite or test mode, suppress remote MariaDB URLs (`url: ''`) to prevent network hangs.

## Verification
- `npm run test:deterministic` (manifest, contracts, RBAC roles, AST v2 workflow compilation).
- `npm run test:direct` (client shell commands, whitelist enforcement, direct session channel tool execution).
- `npm run play:direct` or `npm run play` (in-process direct REPL interactive client).

