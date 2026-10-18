# Curator MiniApp Client REPL Architecture & SQLite Integration Guide

This guide details how to build and maintain **interactive, asynchronous terminal REPLs** for Curator MiniApps and tabletop games using `@curator/host`.

---

## 1. Architectural Principles

1. **Continuous Asynchronous REPL**:
   - Built on `node:readline` and Node's **program** module (`commander.Command`).
   - Non-blocking: background engine events (WebSockets or direct in-process AST execution) stream cleanly into the console without interrupting user input.
2. **Whitelisted Tool Registration**:
   - Only actor-whitelisted tools are registered into the Commander program.
   - Command names, descriptions, and argument schemas are derived directly from Curator tool definitions.
3. **Ambient Speech Fallthrough**:
   - Free-text input that does not match a registered tool or command automatically falls through to the application's designated speech/ambient tool (e.g. `poker_human_speech`, `blueprint_speech`).
4. **Dynamic Non-Blocking Choices**:
   - When the Curator AST engine prompts for user input (e.g., turn actions, table selection), choices are set dynamically via `shell.setChoices(choices)`.
   - Choices are **non-blocking by default**: the actor can enter a choice number (`1`, `2`), type the tool command (`raise 150`, `fold`), chat freely, or inspect state (`/state`, `/table`).
   - A step blocks if and only if the flow context explicitly declares `blocking: true` (e.g., mandatory consent).
5. **Zero Workflow Primitives in Client**:
   - The client has no game loops, pause/resume loops, or state machines. All sequencing, loops, and conditions are driven exclusively by the **Curator AST workflow**.
6. **Dual-Channel Flexibility**:
   - **Direct Mode (`createDirectChannel`)**: In-process direct SQLite execution with zero ports, zero HTTP/WS overhead, and instant execution.
   - **Network Mode (`createWebSocketChannel`)**: Connects to a remote server over WebSockets and GraphQL.

---

## 2. Component Structure

```text
miniapps/<miniapp-name>/src/client/
├── <miniapp>ClientShell.ts   # Declarative tools, inspection commands, and REPL shell config
└── <miniapp>Client.ts        # Channel factory (Direct / WebSocket) & terminal UI runner
```

---

## 3. Implementation Blueprint

### Step 1: Declarative Client Shell (`src/client/<miniapp>ClientShell.ts`)

```typescript
import {
  createClientShell,
  type ClientShell,
  type CuratorChannel,
  type CuratorToolDefinition,
  type ReplCommand,
  type ShellContext,
} from '@curator/host';
import { myDomainTool, mySpeechTool } from '../plugins/myPlugin.js';

export const WHITELISTED_TOOLS: (string | CuratorToolDefinition)[] = [
  myDomainTool,
  mySpeechTool,
];

export const CLIENT_COMMANDS: ReplCommand[] = [
  {
    name: 'status',
    description: 'Inspect current domain state',
    execute: (_rawArgs, _tokens, ctx) => {
      const state = ctx?.getState?.();
      console.log('\x1b[36m[Status]\x1b[0m', state ? JSON.stringify(state, null, 2) : 'Ready');
    },
  },
];

export interface CreateClientShellOptions {
  channel?: CuratorChannel;
  actorName?: string;
  getState?: () => any;
}

export function createMiniAppClientShell(
  opts: CreateClientShellOptions = {}
): ClientShell {
  return createClientShell({
    actorName: opts.actorName || 'User',
    channel: opts.channel,
    defaultToolName: 'my_speech_tool',
    commands: CLIENT_COMMANDS,
    tools: WHITELISTED_TOOLS,
    getState: opts.getState,
    onSpeech: async (text: string) => {
      if (opts.channel) {
        return opts.channel.send('curator:tool_call', {
          tool: 'my_speech_tool',
          args: { text },
        });
      }
    },
    onToolCall: async (toolName: string, args: Record<string, any>, ctx?: ShellContext) => {
      // 1. Whitelist enforcement
      const allowed = ctx?.tools || WHITELISTED_TOOLS;
      const matched = allowed.find(
        (t) => (typeof t === 'string' ? t : t.name) === toolName
      );
      if (!matched) {
        console.log(`\x1b[31m[Security] Tool "${toolName}" is not whitelisted.\x1b[0m`);
        return;
      }

      // 2. Direct local execution if tool definition exists
      if (typeof matched !== 'string' && (matched as any).execute) {
        return (matched as any).execute(args);
      }

      // 3. Channel dispatch
      if (opts.channel) {
        return opts.channel.send('curator:tool_call', { tool: toolName, args });
      }
    },
  });
}
```

---

### Step 2: Client Runner & Dual-Channel Setup (`src/client/<miniapp>Client.ts`)

```typescript
import readline from 'node:readline';
import {
  type CuratorChannel,
  type CuratorHost,
  createWebSocketChannel as createHostWebSocketChannel,
  createDirectChannel,
} from '@curator/host';
import { createMiniAppHost } from '../host.js';
import { createMiniAppClientShell } from './<miniapp>ClientShell.js';

export interface ClientOptions {
  direct?: boolean;
  serverUrl?: string;
  userName?: string;
}

export async function createDirectSessionChannel(opts: ClientOptions = {}): Promise<CuratorChannel> {
  const host: CuratorHost = await createMiniAppHost();
  const directTarget = {
    host,
    conversationId: 1,
    tableId: '1',
    send: async (type: string, payload?: any) => {
      host.events.broadcast(type, payload);
    },
    close: async () => {
      await host.stop();
    },
  };

  const base = createDirectChannel(directTarget as any, '1');
  return {
    ...base,
    close: async () => {
      await base.close();
      await host.stop();
    },
  };
}

export async function createWebSocketChannel(opts: ClientOptions = {}): Promise<CuratorChannel> {
  return createHostWebSocketChannel({
    serverUrl: opts.serverUrl || 'http://127.0.0.1:4000',
    defaultPath: '/api/events',
  });
}

export async function runClientUi(channel: CuratorChannel, userName: string = 'User'): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    let currentState: any = null;

    const cleanup = async () => {
      shell.stop();
      unsubscribe();
      await channel.close();
      resolve();
    };

    process.on('SIGINT', async () => {
      await cleanup();
      process.exit(0);
    });

    const shell = createMiniAppClientShell({
      channel,
      actorName: userName,
      getState: () => currentState,
    });

    // Start continuous asynchronous REPL
    shell.start(rl);

    const unsubscribe = channel.on(async (event: any) => {
      const { type, payload } = event;
      if (payload?.state) currentState = payload.state;

      // Handle AST choice prompts non-blockingly
      if (type === 'curator:choices' || type === 'flow:choices') {
        const choices = (payload.choices || []).map((c: any) => ({
          id: c.id,
          label: c.label,
          execute: async () => {
            await channel.send('curator:choice', { choice: c.id });
          },
        }));
        shell.setChoices(choices, { blocking: Boolean(payload.blocking) });
      }
    });
  });
}

export async function runClient(options: ClientOptions = {}): Promise<void> {
  const channel = options.direct
    ? await createDirectSessionChannel(options)
    : await createWebSocketChannel(options);
  await runClientUi(channel, options.userName);
}
```

---

### Step 3: Wire into Commander CLI (`src/cli.ts`)

```typescript
import { createHostCli } from '@curator/host';
import { createMiniAppHost } from './host.js';

const program = createHostCli(createMiniAppHost, {
  name: 'my-miniapp-cli',
  description: 'Management & interactive shell for MiniApp',
  version: '1.0.0',
});

// Attach REPL command
program
  .command('repl')
  .alias('shell')
  .description('Start interactive asynchronous REPL (in-process SQLite or server channel)')
  .option('--direct', 'Run direct in-process SQLite execution mode', true)
  .option('--server <url>', 'Connect to remote server URL', 'http://127.0.0.1:4000')
  .action(async (opts) => {
    const { runClient } = await import('./client/<miniapp>Client.js');
    await runClient({ direct: opts.direct !== false, serverUrl: opts.server });
  });

program.parse(process.argv);
```

---

## 4. Reference Implementations in Workspace

- **Canonical Template**: [`miniapps/blueprint`](file:///z:/curator/miniapps/blueprint)
  - [`src/client/blueprintClientShell.ts`](file:///z:/curator/miniapps/blueprint/src/client/blueprintClientShell.ts)
  - [`src/client/blueprintClient.ts`](file:///z:/curator/miniapps/blueprint/src/client/blueprintClient.ts)
- **Tabletop Game Reference**: [`minigames/poker`](file:///z:/curator/minigames/poker)
  - [`src/client/pokerClientShell.ts`](file:///z:/curator/minigames/poker/src/client/pokerClientShell.ts)
  - [`src/client/pokerClient.ts`](file:///z:/curator/minigames/poker/src/client/pokerClient.ts)
