# Module Scoping & Sub-Agent Delegation Rules

This repository is a multi-module workspace (`curator`, `server`, `frontend`, `miniapps/keeris`, `chrome-extension`, `curator-rust`, `llamacpp`).

## 1. Strict Module Boundaries
- **Task Scope Isolation**: When working on a task for a specific module (e.g. `miniapps/keeris`), restrict file reads, searches, and modifications strictly to that module's directory and shared contracts.
- **Do Not Contaminate Context**: Do not inspect unrelated modules (e.g. reading `curator-rust` when debugging `frontend` or `keeris`).

## 2. Multi-Module Work Decomposition
When a feature spans multiple modules (e.g. database schema $\rightarrow$ server API $\rightarrow$ frontend UI):
1. **Step 1 - Contracts First**: Read or modify only shared contracts in `curator/` or `prisma/schema.prisma`.
2. **Step 2 - Server Implementation**: Implement server resolvers / tool registry in `server/` or `curator/`.
3. **Step 3 - Client Integration**: Update frontend components in `frontend/` or `miniapps/`.

Execute each stage in order without loading all module files simultaneously.

## 3. Mandatory Rebuild of Changed Dependencies
Whenever modifying interfaces, contracts, types, or shared runtime logic in an upstream module (e.g. `packages/host`, `curator`, `packages/plugin-auth`):
- **Build immediately**: Run `npm --prefix <package-dir> run build` right after making the changes.
- **Prevent `dist/` desynchronization**: Do not proceed to downstream integration (`minigames/*`, `miniapps/*`, `frontend/`, `server/`) until the upstream package has rebuilt its `dist/` artifacts and `.d.ts` declaration files.

## 4. Package Boundaries & Contract-Based Integration
- **Zero Relative Monorepo Escapes**: Never import from sister packages or dist directories using relative escapes (`../../../packages/.../dist/...`). Always use proper package names (`@curator/host`, `@curator/mcp-server`, etc.).
- **Subpath & Index-Based Exports**: Upstream packages must define explicit subpath exports in `package.json` (`.`, `./config`, `./contracts`, `./client`). Do not use wildcard leaks (`"./*": "./dist/*"`). Downstream apps must import only through public subpaths.
- **Contract-Based MiniApp/MiniGame Architecture**: MiniApps and MiniGames are guest extensions, not core forks. They must develop against `@curator/host/contracts` using `defineMiniApp` or `defineMiniGame` with explicit capability declarations (`CuratorAppManifest.requiredHostCapabilities`), isolating domain entities from engine internals.

