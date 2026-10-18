# Building MiniApps with Curator: Third-Party Developer Guide

This guide walks you through building, packaging, and deploying your own **Curator MiniApp** as an external developer or independent team.

A **Curator MiniApp** is a lightweight, domain-focused application that embeds the **Curator Orchestration Core** (`@curator/agent-server`) and **Curator Host** (`@curator/host`). It unites:
- **Domain Data**: Your custom Prisma schema (SQLite, PostgreSQL, or MariaDB).
- **Domain Tools & Evaluators**: Functions your agents can execute (`defineTool`).
- **Agentic Workflows**: High-level, human-readable CoffeeScript or TypeScript scripts.
- **Interactive UI**: A Vue 3 dashboard equipped with the global Developer Console (`CuratorConsole.vue`) for real-time turn, AST, and database inspection.

---

## 1. Quickstart (Under 5 Minutes)

### Step 1: Scaffold your MiniApp
In the Curator workspace, run the automated scaffolder:
```bash
npm run create:miniapp my-domain-app
```
Or manually create a directory under `miniapps/my-domain-app/` with the following `package.json`:

```json
{
  "name": "my-domain-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev:server": "tsx src/server/index.ts",
    "dev:web": "vite --config web/vite.config.ts",
    "build": "tsc && vite build --config web/vite.config.ts",
    "test": "node --test test/*.test.ts"
  },
  "dependencies": {
    "@curator/agent-server": "file:../../curator",
    "@curator/host": "file:../../packages/host",
    "express": "^5.1.0",
    "graphql": "^16.14.2",
    "vue": "^3.5.13"
  },
  "devDependencies": {
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "vite": "^6.2.0"
  }
}
```

### Step 2: Define your Domain Plugin with RBAC (`src/plugin.ts`)
A plugin bundles your custom tools, declarative RBAC domain roles, and vocabulary verbs. Every tool requires explicit actor binding and role authorization:

```typescript
import { CuratorPlugin, defineTool } from '@curator/agent-server';

// 1. Define a deterministic tool with role whitelisting
export const calculateRiskTool = defineTool({
  name: 'calculate_risk',
  description: 'Calculates portfolio risk score given exposure values.',
  parameters: {
    type: 'object',
    properties: {
      exposure: { type: 'number' },
      volatility: { type: 'number' },
    },
    required: ['exposure'],
  },
  accessLevel: 'safe_read',
  requiredRole: 'finance:analyst', // Strict RBAC whitelist: only actors with finance:analyst can execute
  async execute(args) {
    const exp = Number(args.exposure || 0);
    const vol = Number(args.volatility || 1.0);
    return { riskScore: (exp * vol) / 100, status: exp > 500 ? 'HIGH_RISK' : 'NORMAL' };
  },
});

// 2. Export your domain plugin with declarative roles and inheritance
export const myDomainPlugin: CuratorPlugin = {
  name: 'my-domain',
  version: '1.0.0',
  roles: {
    'finance:admin': {
      description: 'System administrator for portfolio management',
      subRoles: ['finance:auditor'],
    },
    'finance:auditor': {
      description: 'Compliance auditor with read and verification privileges',
      subRoles: ['finance:analyst'],
    },
    'finance:analyst': {
      description: 'Analyst capable of executing portfolio risk models',
      subRoles: ['finance:viewer'],
    },
    'finance:viewer': {
      description: 'Read-only observer for dashboard summaries',
    },
  },
  // Default roles granted to authenticated human users (supports multi-role combinations)
  defaultUserRoles: ['finance:analyst', 'finance:viewer'],
  // Roles assigned to the system administrator actor
  systemRoles: ['system:admin', 'finance:admin', 'finance:auditor', 'finance:analyst', 'finance:viewer'],
  tools: {
    calculate_risk: calculateRiskTool,
  },
  // Optional: add custom CoffeeScript DSL verbs via vocabularies
  vocabularies: {
    audit_portfolio: (portfolioId: string) => ({
      type: 'Curator_Tool',
      toolName: 'calculate_risk',
      toolArgs: { portfolioId },
    }),
  },
};
```

### Step 3: Write Agent Workflows (`scripts/audit_workflow.coffee`)
Write multi-agent deliberations using Curator's fluent speech acts:

```coffeescript
# A 2-agent compliance check between an Analyst and an Auditor
forum('compliance_room')
  .as_role('analyst')
  .say('Reviewing portfolio #402 for volatility limits.')
  .tool('calculate_risk', exposure: 750, volatility: 1.4)
  .as_role('auditor')
  .say('Portfolio exceeds standard volatility envelope. Proposing rebalancing.')
  .propose(topic: 'rebalance', patch: { liquidatePercent: 15 })
  .as_role('analyst')
  .vote(choice: 'ACCEPT')
  .synthesize(as_role: 'auditor', summary: 'Rebalance approved at 15% liquidation')
```

### Step 4: Start the Embedded Server (`src/server/index.ts`)
Mount the Curator Host inside your Express backend:

```typescript
import express from 'express';
import { createCuratorHost } from '@curator/host';
import { myDomainPlugin } from '../plugin.js';

const app = express();
const port = 4000;

// Initialize Curator Host with your domain plugin
const host = createCuratorHost({
  port,
  plugins: [myDomainPlugin],
});

await host.start();
console.log(`[MiniApp] Running at http://localhost:${port}`);
```

---

## 2. Choosing Your Operational Mode

Curator MiniApps support two deployment architectures depending on your use case:

### Mode A: Server-Hosted Dual-DB Architecture (Default)
Best for production web applications, multi-user portals, and team collaboration:
- **Node.js / Express**: Serves GraphQL and static web assets.
- **Dual Databases**:
  1. *Domain DB*: PostgreSQL, MariaDB, or SQLite housing your app's core business data.
  2. *Curator DB*: Tracks requests, responses, conversation turns, and audit logs.
- **Bree Cron Scheduler**: Executes scheduled agent workflows in background threads.

### Mode B: Zero-Backend In-Browser WASM Mode (Edge / Privacy-First)
Best for offline-first desktop web apps, privacy-sensitive local analyses, or extensions:
- **100% In-Browser Execution**: Uses `@sqlite.org/sqlite-wasm` on the Origin Private File System (OPFS).
- **Web Worker**: Runs the database and `CuratorRequestProcessor` inside a dedicated browser Web Worker.
- **Zero Server Cost**: Every user has their own private SQLite database and local AST executor.
- See `miniapps/blueprint/wasm/` for the reference WASM + OPFS implementation.

---

## 3. Conversational Roles vs. Security Permissions (RBAC)

When writing agent scripts, **never confuse conversational roles with database RBAC roles**:

| Concept | Scope | Where Defined | Purpose | Example |
| :--- | :--- | :--- | :--- | :--- |
| **Conversational Role** | Dynamic per conversation room $G$ | Script context (`as_role`, `with_role`) | Decides who is speaking, who moderates, or who votes in a turn | `critic`, `proposer`, `dealer`, `chair` |
| **Security Role (RBAC)** | Domain & Project-wide | Plugin manifest & Database (`prisma.role`, `userRole`, `agentRole`) | Decides which tools human users or AI agents are allowed to execute | `poker:dealer`, `poker:player`, `poker:spectator`, `system:admin` |

### Core Security Guarantees:
1. **Domain-Prefixed Role Names**:
   Always prefix domain roles (e.g. `poker:dealer`, `finance:analyst`, `keeris:curator`). Because multiple plugins can co-exist within a single shared database or project, prefixed names prevent privilege escalation and namespace collisions.
2. **Zero-Trust Strict Whitelisting**:
   Curator Core enforces strict whitelisting across all AST and tool executions. If an actor has 0 assigned roles or attempts to call a tool outside its whitelist, execution is immediately halted with a descriptive security denial.
3. **Mandatory Actor Binding**:
   Every tool call must bind to either an authenticated human (`userId`) or an agent actor (`agentId`). Unbound calls are blocked.
4. **Multi-Role Combinations**:
   Actors can hold multiple roles simultaneously. For example, a human player in Poker can have both `['poker:player', 'poker:spectator']`.
5. **Composable Role Inheritance**:
   Roles can compose sub-roles via `subRoles: ['...']` (stored in `RoleInheritance`). For example:
   - `poker:dealer` inherits `poker:player`
   - `poker:player` inherits `poker:spectator`
   - A dealer actor can automatically execute player and spectator tools without duplicate privilege assignments.

### Multi-Project Architecture & Database Model Relation Scoping

A single MiniApp can run the **same engine and tools** across **several distinct projects** (e.g. multiple tables, VIP lounges, or tournament rooms), with full content isolation and project-scoped user access:

1. **`ProjectRole` Database Model Relation**:
   Roles are assigned to projects directly via the `ProjectRole` model (`Project` has 0 - $n$ `Role` records). Roles maintain clean domain names (`poker:player`, `poker:dealer`, `poker:spectator`) without string prefixing.
2. **`UserRole` with `projectId`**:
   User permissions are scoped to specific projects through the `UserRole.projectId` foreign key:
   - `projectId == null`: Global role (e.g. system administrator).
   - `projectId == 'table_casual'`: User possesses that role *only* within that specific project.
3. **Multi-Project Host APIs**:
   ```typescript
   // Create multiple tables/projects sharing the same engine
   const casualTable = await host.createProject({
     id: 'table_casual',
     name: 'Casual Table #1',
     roles: ['poker:player', 'poker:spectator'],
   });

   const vipLounge = await host.createProject({
     id: 'table_vip',
     name: 'VIP High Stakes Room',
     roles: ['poker:dealer', 'poker:spectator'], // Player role restricted
   });

   // Assign user access per project
   await host.assignUserProjectRole(aliceId, 'poker:player', 'table_casual');
   await host.assignUserProjectRole(aliceId, 'poker:spectator', 'table_vip');
   ```

In scripts, use conversational `as_role` for discourse:
```coffeescript
as_role 'proposer', ->
  propose topic: 'security_update', version: '2.1'

as_role 'critic', ->
  say 'Needs backward compatibility tests.'
```

---

## 4. Testing Your MiniApp

Curator MiniApps test easily with Node's native test runner (`node:test`):

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { CuratorEngine, compileCoffeeScriptToAST } from '@curator/agent-server';
import { myDomainPlugin } from '../src/plugin.js';

test('MyDomain: Plugin registers and CoffeeScript compiles', async () => {
  const engine = new CuratorEngine();
  engine.registerPlugin(myDomainPlugin);
  assert.ok(engine.tools.has('calculate_risk'));

  const script = `
  seq 'risk_check',
    tool 'calculate_risk', exposure: 200, volatility: 1.0
  `;
  const ast: any = await compileCoffeeScriptToAST(script);
  assert.equal(ast.type, 'Curator_Sequential');
});
```
Run tests with:
```bash
npm run test
```

---

## 5. Next Steps & References
- [Scripting Reference Guide](./SCRIPTING_REFERENCE.md): Comprehensive cheatsheet of all speech acts, discourse patterns, and AST control flow.
- [Reference Blueprint App](file:///z:/curator/miniapps/blueprint/): Fully functional reference MiniApp with Vue 3 UI, Dev Console, and P2P mesh wiring.
- [Tabletop Plugin Example](file:///z:/curator/curator/src/plugins/tabletop/): Example of building a rich domain DSL on top of the generic engine.
