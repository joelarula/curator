# Curator: Distributed Agentic Orchestration & MiniApp Platform

Curator is an advanced multi-agent execution engine and application platform designed for **distributed agent swarms**, **deterministic tool pipelines**, and **domain MiniApps**.

It pairs the safety and audibility of a formal **Execution AST** with the human-readable expressiveness of **speech-act discourse scripting** in CoffeeScript and TypeScript.

---

## 🏛️ The 5-Layer Abstraction Architecture

Curator separates concerns into five decoupled, deterministic layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 4: Domain MiniApps & DSLs (e.g. Tabletop, Keeris, Blueprint)     │
│          game, ante, deal_private, hit, stand, search_graph            │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 3: Conversational Governance & Topologies                        │
│          dialog, forum, polylogue, catechism, soliloquy, as_role       │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 2: Universal Speech Acts (Illocutionary Pragmatics)             │
│          ask (QUERY), propose, inform, vote, synthesize, assert        │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 1: Context & Mesh Security Fabric                                │
│          $context.turn, dynamic capability leases, exposure gating     │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 0: Formal Execution AST (CuratorRequestProcessor)                │
│          Curator_Sequential, Curator_Parallel, IfElse, WhileLoop, Tool │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quickstart for Third-Party Developers

### 1. Scaffold a New MiniApp in 5 Seconds
To create a clean, working MiniApp scaffolded with a domain plugin, Express server, and tests:
```bash
npm run create:miniapp my-domain-app
```
This generates `miniapps/my-domain-app/` configured to consume `@curator/agent-server` and `@curator/host`.

### 2. Define Your Domain Plugin
```typescript
import { CuratorPlugin, defineTool } from '@curator/agent-server';

export const myDomainPlugin: CuratorPlugin = {
  name: 'my-domain',
  tools: {
    analyze_data: defineTool({
      name: 'analyze_data',
      description: 'Executes domain data analysis',
      parameters: { type: 'object', properties: { metric: { type: 'string' } } },
      accessLevel: 'safe_read',
      async execute(args) {
        return { result: 'computed', metric: args.metric };
      },
    }),
  },
};
```

### 3. Write Natural Multi-Agent Scripts
```coffeescript
# Deliberation in a forum room with floor governance and synthesis
forum('audit_committee')
  .as_role('analyst')
  .say('Reviewing portfolio #402 for volatility limits.')
  .tool('analyze_data', metric: 'volatility')
  .as_role('auditor')
  .say('Portfolio exceeds standard volatility envelope. Proposing rebalancing.')
  .propose(topic: 'rebalance', patch: { liquidatePercent: 15 })
  .as_role('analyst')
  .vote(choice: 'ACCEPT')
  .synthesize(as_role: 'auditor', summary: 'Rebalance approved at 15% liquidation')
```

---

## 📦 Monorepo Package Map

| Module | NPM Package | Purpose |
| :--- | :--- | :--- |
| `curator/` | `@curator/agent-server` | **Core Orchestration Engine**: Formal Execution AST, Speech-Act router, sandboxed CoffeeScript compiler, and plugin SPI. |
| `packages/host/` | `@curator/host` | **Server Host**: Standalone Express/GraphQL API, Bree cron scheduler, and single-node conversation router. |
| `packages/federation/` | `@curator/federation` | **P2P Mesh Network**: Cross-project message routing, remote tool proxies, dynamic capability leases, and peer sync. |
| `packages/mcp-server/` | `@curator/mcp-server` | **Model Context Protocol**: Dynamic tool exposure controller with load-shedding and RBAC gating. |
| `packages/curator-console/`| `@curator/console` | **Developer Console**: Vue 3 floating debug console (`CuratorConsole.vue`) for AST inspection and live logs. |
| `miniapps/blueprint/` | `@miniapps/blueprint` | **Reference MiniApp**: Complete template featuring Vue 3 frontend, SQLite/PostgreSQL, and tool examples. |

---

## 📚 Documentation & Guides

- **[MiniApp Developer Setup Guide](file:///z:/curator/docs/MINIAPP_SETUP_GUIDE.md)**: End-to-end tutorial on building, packaging, and deploying MiniApps (Server Dual-DB vs In-Browser WASM/OPFS).
- **[Scripting Language Reference](file:///z:/curator/docs/SCRIPTING_REFERENCE.md)**: Complete cheatsheet of speech acts, discourse topologies, flow control primitives, and domain DSLs.
- **[Repository Architecture & Standards (AGENTS.md)](file:///z:/curator/AGENTS.md)**: Monorepo rules, source-of-truth ordering, and cross-module change conventions.

---

## 🧪 Validating the Workspace

Run targeted module tests:
```powershell
# Host & discourse tests
pnpm --filter @curator/host test

# Federation & mesh tests
pnpm --filter @curator/federation test

# Core engine build
pnpm --filter @curator/agent-server build
```
