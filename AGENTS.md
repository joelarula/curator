# Curator workspace rules
Module rules live in `<module>/AGENTS.md`; read them when working there.
Full rationale, examples, pitfalls, run commands: `docs/AGENT_GUIDE.md` (read on demand, not auto-loaded).

- Modules: server (GraphQL/tools/Prisma-PG), frontend (Vue), curator (agent-server, SQLite/MariaDB), curator-rust, llamacpp, chrome-extension, curator-vscode-plugin, packages/*, miniapps/*, minigames/*.
- `backup/` is legacy: never edit, never use as source of truth. Priority: code > module docs > root docs.
- Change order: schema → server/contracts → frontend → extensions → docs.
- Scope all DB entities to active project IDs + `'system'`; IDs come from host session/`x-project-id`, never client payloads.
- Workflows run only as compiled AST (`compileToAST`); no legacy `toolCalls/toolArgs/callbacks`.
- Package boundaries & contracts: MiniApps/MiniGames develop against contracts (`@curator/host/contracts`, `defineMiniApp`/`defineMiniGame`); never import internal engine files or use relative escapes (`../../../.../dist/...`); consume only package index/subpath exports (`@curator/host/config`, `@curator/host/client`).
- Barrel hygiene & deprecation facades: Prefer explicit named exports over wildcard `export *` in domain barrels (`models/index.ts`). Never abruptly delete public symbols, type guards, or helpers during refactors—maintain a 1-release `@deprecated` shim/re-export to prevent consumer breakage.
- Client shell & identity: Use `@curator/host` identity primitives (`resolveClientIdentity`, `createClientShell`); never implement custom domain-level profile persistence or TTY prompt loops in MiniApps/MiniGames.
- Tools/events go through `host.runTool` / `host.emitEvent`; never call handlers directly.
- After changing `packages/host`, `curator`, or shared packages, rebuild (`npm --prefix <pkg> run build`) before testing downstream.
- Verify with `tsc --noEmit`/targeted checks. Ask before any command >15s or full test suites.
- Context: read only task-relevant files; use `view_range`/grep for files >300 lines; never read lockfiles, `dist/`, generated or `backup/` content. Ignore lists: `.geminiignore`, `.antigravityignore` (keep in sync).
- Minimal diffs; no unrelated reformatting; no generated-file edits.
- Handoff: what changed, why, how validated, limitations.
