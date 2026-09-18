# WASM & OPFS In-Browser MiniApp Architecture Reference

This reference documents the zero-backend / browser-native architecture for Curator MiniApps using **WASM SQLite (OPFS)**, **Prisma DDL automation**, **In-Worker AST Execution**, and the **Curator Dev Console**.

---

## 1. Architecture Overview

```
+-------------------------------------------------------------------------------------------+
|                                    BROWSER ENVIRONMENT                                    |
+-------------------------------------------------------------------------------------------+
|  Vue 3 + Vite UI (Main Thread)                                                            |
|  - Masthead: 🤖 Dev Console Toggle (Ctrl + `)                                             |
|  - Views: Domain Dashboard, Search, Playlists, Program Agents                            |
|  - CuratorConsole.vue: Live Logs, Agent Trigger, AST Inspector, Health, Export/Import DB  |
|                                     │                                                     |
|                                     │ postMessage (Typed Envelope)                        |
|                                     ▼                                                     |
|  Dedicated Web Worker (db-worker.js)                                                      |
|  ├── In-Worker GraphQL Layer (graphql-schema.js)                                          |
|  ├── Curator RequestProcessor AST Engine (wasm-curator-engine.js)                          |
|  │   - Checkpointed AST Execution (Sequence, ForEach, ToolTask)                           |
|  │   - Universal Pause & Resume Support (__pausedStepIndex__, __pausedIterIndex__)        |
|  │   - Browser-native tools (fetch, DOMParser, audio downloader)                          |
|  └── SQLite WASM Driver (@sqlite.org/sqlite-wasm)                                         |
|      └── Origin Private File System (OPFS: /<name>.sqlite3 via sync access handles)        |
+-------------------------------------------------------------------------------------------+
```

---

## 2. Prisma-to-WASM DDL Pipeline

Instead of maintaining fragile hand-written SQL strings for table creation, the SQLite schema is defined exclusively in Prisma and compiled automatically into browser DDL.

### Schema Definition (`prisma-sqlite/schema.prisma`)
Place the standalone SQLite schema in `prisma-sqlite/schema.prisma` (outside `prisma/` to avoid multi-schema collisions):

```prisma
datasource db {
  provider = "sqlite"
}

// 1. Domain Entities
model Program { ... }
model Episode { ... }
model Track { ... }

// 2. Curator AST Orchestration Entities
model User { ... }
model Project { ... }
model Conversation { ... }
model Script {
  id          String   @id
  name        String   @unique
  description String?
  ast         String   // Formal JSON AST
  createdAt   String   @default(dbgenerated("CURRENT_TIMESTAMP"))
}
model Agent {
  id        String   @id
  name      String   @unique
  scriptId  String?
  schedule  String?
  isActive  Int      @default(1)
  createdAt String   @default(dbgenerated("CURRENT_TIMESTAMP"))
}
model Request {
  id             String   @id
  userId         String
  projectId      String
  conversationId String
  scriptId       String?
  ast            String   // AST snapshot
  context        String?  // Execution state & checkpoints
  status         String   @default("pending") // pending | running | paused | completed | failed
  createdAt      String   @default(dbgenerated("CURRENT_TIMESTAMP"))
}
model Response {
  id        String   @id
  requestId String
  content   String
  createdAt String   @default(dbgenerated("CURRENT_TIMESTAMP"))
}
```

### Automated DDL Generator (`scripts/generate-sqlite-schema.js`)
Uses `prisma migrate diff` to generate zero-error DDL:

```javascript
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(import.meta.url.replace(/^file:\/\/\/?/, '')), '..');
const schemaPath = resolve(root, 'prisma-sqlite/schema.prisma');
const outPath = resolve(root, 'wasm/generated-schema.js');

const sql = execSync(`npx prisma migrate diff --from-empty --to-schema-datamodel "${schemaPath}" --script`, {
  encoding: 'utf-8',
});

const content = `/**
 * AUTO-GENERATED FROM prisma-sqlite/schema.prisma. DO NOT EDIT DIRECTLY.
 * Run: node scripts/generate-sqlite-schema.js
 */
export const SCHEMA_DDL = ${JSON.stringify(sql)};
`;

writeFileSync(outPath, content, 'utf-8');
console.log(`[Schema Generator] Wrote DDL (${sql.length} chars) -> ${outPath}`);
```

---

## 3. OPFS Configuration & Security Headers

SQLite WASM requires **SharedArrayBuffer** and synchronous OPFS file access handles. This mandates strict cross-origin headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### Static Server Header Config (`serve.json`)
```json
{
  "rewrites": [
    { "source": "**", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "**",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

### Vite Dev Server (`vite.config.js`)
```javascript
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

---

## 4. In-Worker Curator AST RequestProcessor

The AST RequestProcessor runs in the dedicated web worker, ensuring scraping and heavy database transactions never freeze the 60fps UI.

### Checkpointed Pause & Resume Support
When a workflow is paused mid-execution, execution state and step indices are preserved in `Request.context`:

```javascript
// Step checkpointing in Sequence AST nodes:
for (let i = startStepIndex; i < node.steps.length; i++) {
  if (isPaused()) {
    context.__pausedStepIndex__ = i;
    db.exec('UPDATE requests SET status = ?, context = ? WHERE id = ?',
      ['paused', JSON.stringify(context), requestId]);
    return { paused: true, stepIndex: i };
  }
  // execute node.steps[i]...
}

// Iteration checkpointing in ForEach AST nodes:
for (let i = startIterIndex; i < collection.length; i++) {
  if (isPaused()) {
    context.__pausedIterIndex__ = i;
    db.exec('UPDATE requests SET status = ?, context = ? WHERE id = ?',
      ['paused', JSON.stringify(context), requestId]);
    return { paused: true, iterIndex: i };
  }
  // execute body with collection[i]...
}
```

---

## 5. Database Lifecycle: Export, Import, & Clean Seeds

### 1-Click Binary Export (`exportDatabase`)
Flushes WAL checkpoints and extracts the OPFS database directly as a `.sqlite3` binary download:
```javascript
export async function exportDatabaseBlob(dbFileName = 'keeris.sqlite3') {
  if (dbInstance) {
    try { dbInstance.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (_) {}
  }
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(dbFileName);
  const file = await handle.getFile();
  return await file.arrayBuffer();
}
```

### 1-Click Binary Import (`importDatabase`)
Replaces the OPFS database with any user-uploaded `.sqlite3` or `.db` file using `OpfsDb.importDb`:
```javascript
export async function importDatabaseFile(arrayBuffer, dbFileName = 'keeris.sqlite3') {
  if (dbInstance) {
    try { dbInstance.close(); } catch (_) {}
    dbInstance = null;
  }
  await sqlite3Instance.oo1.OpfsDb.importDb(`/${dbFileName}`, new Uint8Array(arrayBuffer));
  dbInstance = await openOpfsDbWithRetry(`/${dbFileName}`);
  ensureBaselineTables(dbInstance);
  return true;
}
```

### Clean Virgin Seed Generator (`scripts/create-clean-seed.js`)
Builds a fresh, initialized database (17 programs, 17 agents, 0 episodes, 0 tracks):
```powershell
npm run export:seed:clean
npm run build:web
```

---

## 6. Curator Dev Console Component

The universal **Curator Dev Console** (`CuratorConsole.vue`) mounts globally in `App.vue`:
- **Keyboard Shortcut**: `Ctrl + \`` (or `Cmd + \``) to open/close from any route.
- **Top Masthead Button**: Always displays live engine state (`⚡ ACTIVE` / `⏸ PAUSED`).
- **Unified Actions**: Pause/Resume, Export Database (.sqlite3), Import Custom DB, Wipe/Reset DB.
- **Live Monitoring**: Searchable real-time log terminal, active episode scraping progress bar, AST request history inspector, and OPFS storage metrics (MB used / quota).

---

## 7. Build & Development Workflow

### Development
```powershell
# 1. Generate updated SQLite DDL whenever prisma schema changes
node scripts/generate-sqlite-schema.js

# 2. Run Vite dev server with COOP/COEP headers
npm run dev:web
```

### Production Build & Preview
```powershell
# 1. Generate clean virgin seed (or full archive seed)
npm run export:seed:clean

# 2. Build production web bundle
npm run build:web

# 3. Preview locally with strict COOP/COEP serve.json
npm run preview:web
```
