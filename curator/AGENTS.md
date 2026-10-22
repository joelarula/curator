# curator (agent-server) rules
- Prisma: `prisma-sqlite/` (no PG features/vectors), `prisma-mariadb/` (cPanel). One engine per folder; never co-locate schemas.
- Sync core model changes (`Project, User, Agent, Request, Response, Conversation`) with `server/prisma/schema/core.prisma`.
- Custom Prisma output (`src/generated/prisma-sqlite`): map `@prisma/client` in `tsconfig.json` paths.
- Execution: `CuratorRequestProcessor` runs AST nodes (`Sequence, ForEach, IfElse, Spawn, While, ToolTask`); commits context and creates a `Response` per step. No AuditLog table.
- CLI/REPL/API: `host.runTool` / `host.emitEvent` only. Scripts stored as immutable `ScriptVersion` (ref by `scriptId`+`scriptVersion`).
- `src/cli.ts`: only `commander` at top level; `await import(...)` heavy deps inside `.action`. Run TS via `node src/cli.ts`, no tsx loader.
- Rebuild after type/contract changes: `npm --prefix curator run build`.
