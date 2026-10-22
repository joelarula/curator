# server rules
- Commands: `pnpm --filter @curator/backend run dev|build|test|prisma:generate|prisma:migrate|db:push`.
- New tool: handler in `src/services/tools/` → register in `src/services/ToolRegistry.ts` → name in `tools/manifest.ts` → input types in `tools/types.ts` → document in `SCRIPTING.md`.
- Resolvers: `buildProjectScopeWhere(context.activeProjectIds || context.activeProjectId)` in Prisma `where`; no project args in signatures.
- Postgres schema `prisma/schema/` (pgvector). Never put other engine schemas in the same `prisma/` tree.
- Core models (`Project, User, Agent, Request, Response, Conversation`): sync changes to `curator/prisma-sqlite/` and `curator/prisma-mariadb/`.
- Scripts: sandboxed VM; orchestrate tools, no business logic in script text; use placeholders, not hardcoded outputs.
- Local LLM: use llama tools; `llama_request` for unsupported endpoints. Honor env vars for URLs/model paths.
