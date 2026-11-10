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

---

## Run status (`useRunTimeline`)

`CuratorHarness` shows a status line per agent turn, built from the typed `curator:progress` stream your adapter
already delivers through `onProgress(type, payload)`. No adapter change is needed.

Use it in your own components:

```typescript
import { useRunTimeline, HarnessRunStatus } from '@curator/console';

const timeline = useRunTimeline(adapter.onProgress?.bind(adapter));
timeline.begin(requestId);   // root request of the turn
// <HarnessRunStatus :run="timeline.current.value" />
timeline.end();
```

The fold and the line text come from `@curator/host/contracts` (`applyProgressEvent`, `summarizeRun`,
`describeProgressEvent`), shared with the CLI: `ClientShell` follows its channel's progress by itself (live line,
then a summary). Tool turns show a run when the server's `executeTool` returns a `requestId`.

---

## Interrupts (`useInterrupts`, `useChoices`)

Open interrupts (prompts, tool approvals, event waits) appear as cards (`HarnessInterruptCard`) or, for prompts with
choices, in the choice bar. Answers go through the `conversation_resume` tool via your server's `executeTool`
mutation; the list is loaded with `conversation_interrupts` and kept current from `curator:progress`. An open
interrupt's choices take precedence over speech-act choices.

---

## Output panel (`useSurfaces`, `HarnessSurfacePanel`)

Tools return `uiSurface: { component, title, data }` with their result. Built-in components: `table`
(`data: { columns?, rows }`), `markdown`, `code` (`{ language, text }`), `json`, `mermaid`, `html` / `svg` (rendered in a
sandboxed iframe), `image` (`{ src }`, data URLs and same-origin only), and the resource views. Register a component
under the same name in `customComponents` to replace a built-in. Agent replies render as sanitized Markdown, and their
diagrams, pages, JSON and tables can be opened in the panel. Requires `marked`, `dompurify` and `mermaid`
(dependencies of this package; without them text stays plain and diagrams show their source).
