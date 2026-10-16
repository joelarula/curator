# Curator Texas Hold'em MiniApp

Autonomous, event-driven Texas Hold'em poker engine orchestrating human and agent players via the **Curator Execution AST** and `CuratorRequestProcessor`.

---

## 🏛 Architecture & Execution Modes

Both execution modes share the exact same underlying declarative workflow (`poker_workflow.coffee`) and `CuratorRequestProcessor` execution core. Zero game logic is duplicated.

```
                  ┌────────────────────────────────────────┐
                  │    poker_workflow.coffee (AST Core)    │
                  └───────────────────┬────────────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
   Mode A: Interactive Network Server        Mode B: Direct Synchronous Runner
   • Standalone HTTP + WebSocket server       • In-process step runner (CLI & tests)
   • Runs background polling loop             • Advances synchronously turn-by-turn
   • Pure network CLI client (pokerClient)    • Zero network ports or listeners
```

### Mode A: Interactive Network Server & Client
- **Server (`npm run serve` / `poker serve`)**:
  - Boots `CuratorHost` + `CuratorRequestProcessor`.
  - Streams table events over WebSockets (`ws://127.0.0.1:4000/api/events`).
  - Accepts actions and table talk over WebSockets and REST.
- **Client (`npm run play` / `poker play`)**:
  - Lightweight terminal UI.
  - Communicates exclusively via WebSockets with zero database dependencies.

### Mode B: Direct Lightweight In-Process Play
- **Direct Play (`npm run play:direct` / `poker play --direct`)**:
  - Direct in-process execution with **zero outer APIs or network sockets**.
  - Synchronously steps Curator AST from human action A to next turn gate B.
  - Same rich interactive tabletop chat experience (choices, `/whisper`, `/banter`, inner narratives) with zero network overhead.

---

## 🚀 Quick Start

### 1. Direct Local Play (Mode B - zero network sockets)
```bash
npm run play:direct
# or
poker play --direct
```

### 2. Client-Server Play (Mode A)
**Terminal 1 (Server):**
```bash
npm run serve
```

**Terminal 2 (Client):**
```bash
npm run play
```

### 3. Run Automated Tests
```bash
npm test
```
All 16 test suites validate both Mode A (Server-Client WebSocket streaming) and Mode B (Direct synchronous AST execution), as well as hand evaluation, side pots, agent personas, and asymmetric speech acts.
