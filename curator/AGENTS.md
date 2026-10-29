# curator (agent-server) rules
- Prisma: `prisma-sqlite/` (no PG features/vectors), `prisma-mariadb/` (cPanel). One engine per folder; never co-locate schemas.
- Sync core model changes (`Project, User, Agent, Request, Response, Conversation`) with `server/prisma/schema/core.prisma`.
- Custom Prisma output (`src/generated/prisma-sqlite`): map `@prisma/client` in `tsconfig.json` paths.
- Execution: `CuratorRequestProcessor` runs AST nodes (`Sequence, ForEach, IfElse, Spawn, While, ToolTask`); commits context and creates a `Response` per step. No AuditLog table.
- Node dispatch: `NodeRegistry` (`src/engine/nodes/`); new handlers go in their own module using only `NodeContext` (base primitives + focused services `ctx.events`, `ctx.tools`, `ctx.calls`, `ctx.llm`; add a service rather than growing the base). Plugins contribute `nodeHandlers` (non-`Curator_` types), `services` (`provide(defineService<T>(name), impl)`, read with `ctx.service(key)`) and `maintenanceSystems`; processors also take `nodeHandlers` / `services` options. Tools run by a processor get `ctx.service` / `ctx.tryService` too; the host is `CuratorHostService` (`@curator/host`), `ctx.host` is deprecated. Poll-tick passes are ordered `MaintenanceSystem`s (`registerMaintenanceSystem`, `disabledMaintenance`).
- CLI/REPL/API: `host.runTool` / `host.emitEvent` only. Scripts stored as immutable `ScriptVersion` (ref by `scriptId`+`scriptVersion`).
- `src/cli.ts`: only `commander` at top level; `await import(...)` heavy deps inside `.action`. Run TS via `node src/cli.ts`, no tsx loader.
- Rebuild after type/contract changes: `npm --prefix curator run build`.
