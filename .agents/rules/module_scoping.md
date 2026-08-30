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
