# @curator/console

The universal, domain-agnostic **Curator Dev Console** component for Vue 3.

Provides out-of-the-box monitoring, telemetry, and database lifecycle management for the Curator platform:
- **AST Workflow Monitor**: Live inspection of `requests` and `responses` records with syntax-highlighted AST JSON.
- **Engine Control**: Universal Pause and Resume with step-level and iteration-level checkpointing.
- **Agent Lifecycle**: One-click agent execution triggers and schedule visibility.
- **Live Terminal & Progress**: Colored log feed, IPC message inspection (`postMessage_tx` / `postMessage_rx`), and real-time step progress bars.
- **Database Operations**: 1-click `.sqlite3` binary export, 1-click `.sqlite3` binary import, and full storage reset.
- **Storage Metrics**: Live disk usage and quota estimates via `navigator.storage.estimate()`.

---

## Installation

In your MiniApp or Curator frontend `package.json`:

```json
{
  "dependencies": {
    "@curator/console": "file:../../packages/curator-console"
  }
}
```

---

## Usage

```vue
<template>
  <div id="app">
    <!-- Your Domain UI -->
    <router-view />

    <!-- Pure Curator Dev Console -->
    <CuratorConsole v-model="consoleOpen" :adapter="curatorAdapter" />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { CuratorConsole } from '@curator/console';
import { curatorAdapter } from './adapter';

const consoleOpen = ref(false);
</script>
```

---

## Implementing `CuratorConsoleAdapter`

```typescript
import type { CuratorConsoleAdapter } from '@curator/console';

export const curatorAdapter: CuratorConsoleAdapter = {
  requestGraphql: (query, variables) => client.query(query, variables),
  onProgress: (callback) => client.subscribe(callback),
  togglePause: () => client.togglePause(),
  getProcessorState: () => client.isPaused(),
  exportDatabase: () => client.exportDatabase(),
  importDatabase: (file) => client.importDatabase(file),
  resetDatabase: () => client.resetDatabase(),
  triggerAgent: (agentId) => client.triggerAgent(agentId),
};
```
