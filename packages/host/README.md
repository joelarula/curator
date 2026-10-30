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

## Application Profiles

Spring-style config profiles for an app (`appId`). Layers, later winning:

1. `.env`, then `.env.<profile>` (never override variables already set)
2. `<appId>.config.yaml|yml|json`
3. `<appId>.config.<profile>.*`, one per active profile in the order given

Active profiles: the `profiles` option, else `<APPID>_PROFILES`, else `CURATOR_PROFILES`, else `profiles.active` in the base file. `createHostCli` accepts `--profile dev,local` (sets `CURATOR_PROFILES`).

```typescript
const cfg = loadAppConfig<MyConfig>({ appId: 'poker', searchDirs: [process.cwd(), moduleRoot] });
// cfg.activeProfiles, cfg.values (merged, without reserved keys), cfg.sources (files applied)
const host = await createCuratorHost({ ...cfg.host, name: 'poker' });
```

The reserved `host:` key carries host settings (`profile: server|embedded|ephemeral`, `definitions`, `retention`, `astStorage`, `logLevel`, ...), so e.g. `poker.config.test.yaml` can switch the host to `ephemeral`.

## Client Identity

`resolveClientIdentity({ appId })` resolves who uses a client app: explicit name → `auth.whoami()` → stored identity (`~/.curator/identities/<appId>.json`) → terminal prompt → fallback name.

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
