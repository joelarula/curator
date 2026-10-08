# `@curator/host`

Standardized Curator Orchestration Host Runtime.

Replaces per-miniapp boilerplate with a single host runtime that:
- Provisions the Curator SQLite or MariaDB database
- Scopes System User, Project, and Conversation records
- Registers domain plugins into `CuratorEngine`
- Starts `CuratorRequestProcessor` background polling with concurrency limits
- Exposes `triggerAgent()`, `pauseRequest()`, `resumeRequest()`, and idempotent `seed()`
- Provides a centralized event bus (`CuratorHostEvents`) with WebSocket streaming support

---

## Installation

Within the Curator monorepo:

```json
{
  "dependencies": {
    "@curator/host": "workspace:*"
  }
}
```

---

## Quickstart

```typescript
import { createCuratorHost } from '@curator/host';

const host = await createCuratorHost({
  name: 'facilitator',
  dataDir: process.env.DATA_DIR ?? './data',
  curatorDb: {
    path: undefined, // Defaults to {dataDir}/state/curator.db
  },
  registerPlugins: async (ctx) => {
    // ctx.dataDir, ctx.domainDb
    return registerFacilitatorPlugins(ctx);
  },
});

// Start request processor polling
await host.start();

// Seed tools, scripts, and agents idempotently
await host.seed();

// Trigger a registered agent workflow
const request = await host.triggerAgent('implement_issue', {
  jiraKey: 'POMS-123',
});

// Clean shutdown on server termination
await host.stop();
```

---

## Event Bus & WebSocket Streaming

`host.events` provides a typed event bus:

```typescript
// Listen to all events
host.events.onEvent((event) => {
  console.log(`[Event ${event.type}]`, event.payload);
});

// Listen to specific event types
host.events.onType('request_done', (payload) => {
  console.log('Request completed:', payload.requestId);
});

// Attach WebSocket streaming server (e.g. to an Express/HTTP server)
host.events.attachWebSocketServer(httpServer, '/api/curator/ws');
```

---

## Seeding via CLI

```bash
npx curator-seed --name facilitator --data-dir ./data
```
