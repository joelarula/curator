import readline from 'node:readline';
import {
  type CuratorChannel,
  type CuratorHost,
  createWebSocketChannel as createHostWebSocketChannel,
  createDirectChannel,
  normalizeWsUrl,
} from '@curator/host';
import { connectBlueprintServer, createBlueprintRuntime, type BlueprintRuntime } from '../host.js';
import { createAssistant } from '../harness/assistant.js';
import { BLUEPRINT_SERVICE } from '../harness/env.js';
import { createBlueprintClientShell } from './blueprintClientShell.js';

export interface BlueprintClientOptions {
  direct?: boolean;
  serverUrl?: string;
  userName?: string;
  databasePath?: string;
}

/** Direct channels also carry the in-process runtime (auth sessions, MCP registry, assistant). */
export type BlueprintChannel = CuratorChannel & { runtime?: BlueprintRuntime };
export { normalizeWsUrl };

/**
 * Creates a network-backed channel communicating with an external Blueprint Server over WebSockets.
 */
export async function createWebSocketChannel(options: BlueprintClientOptions = {}): Promise<BlueprintChannel> {
  return createHostWebSocketChannel({
    serverUrl: options.serverUrl || 'http://127.0.0.1:4100',
    envUrlKey: 'BLUEPRINT_SERVER_URL',
    defaultPath: '/api/events',
  });
}

/**
 * Creates a lightweight in-process direct SQLite Curator channel.
 * Zero outer APIs, zero network/TCP ports, pure direct AST execution from human action.
 */
export async function createDirectSessionChannel(
  options: BlueprintClientOptions = {}
): Promise<BlueprintChannel> {
  console.log('\x1b[90m[Curator] Booting direct in-process SQLite host runtime...\x1b[0m');
  const runtime = await createBlueprintRuntime({ databasePath: options.databasePath });
  const host: CuratorHost = runtime.host;
  // The assistant agent runs as Requests picked up by the processor.
  await host.start(300);

  const directTarget = {
    host,
    conversationId: 1,
    tableId: '1',
    send: async (type: string, payload?: any) => {
      host.events.broadcast(type, payload);
      if (type === 'curator:tool_call') {
        const { tool, args } = payload || {};
        if (host.engine.tools.get(tool)) {
          // Every tool call is a Request (RBAC, approval, Response) — never a direct function call.
          const { result, status, requestId } = await host.runTool(tool, args || {}, { origin: 'REPL' });
          if (status === 'WAITING_FOR_USER') {
            console.log(`\x1b[33m⏸ [Tool "${tool}"] awaiting approval (request #${requestId})\x1b[0m`);
            return { status, requestId };
          }
          console.log(`\x1b[32m✔ [Tool "${tool}" Result]:\x1b[0m`, JSON.stringify(result, null, 2));
          return result;
        }
      }
    },
    close: async () => {
      await host.stop();
    },
  };

  const baseChannel = createDirectChannel(directTarget as any, '1');
  return {
    ...baseChannel,
    runtime,
    close: async () => {
      await runtime.registry.close();
      await baseChannel.close();
      await host.stop();
    },
  };
}

/**
 * Primary terminal UI runner for Blueprint MiniApp.
 * Takes any BlueprintChannel (WebSocket or Direct in-process SQLite) and manages
 * the continuous asynchronous REPL loop.
 */
export async function runBlueprintClientUi(
  channel: BlueprintChannel,
  userName: string = 'User',
  existingRl?: readline.Interface
): Promise<void> {
  console.log('\n\x1b[1m\x1b[36m=== Curator Blueprint MiniApp REPL ===\x1b[0m');
  console.log('\x1b[90m(Type /help for commands, /calc <base> [mult], or type to talk)\x1b[0m\n');

  const rl =
    existingRl ||
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

  return new Promise((resolve) => {
    let currentState: any = null;

    const cleanup = async () => {
      shell.stop();
      unsubscribe();
      await channel.close();
      resolve();
    };

    process.on('SIGINT', async () => {
      console.log('\n\x1b[33m[Blueprint] Exiting shell...\x1b[0m');
      await cleanup();
      process.exit(0);
    });

    const runtime = channel.runtime;
    const assistant = runtime ? createAssistant(runtime.host) : undefined;

    const shell = createBlueprintClientShell({
      channel,
      actorName: userName,
      getState: () => currentState,
      auth: runtime?.auth ?? undefined,
      // After signing in, sync the blueprint server so its tools become available.
      onAuthLogin: async () => {
        if (!runtime) return;
        const sync = await runtime.registry.sync(runtime.host.project.id, BLUEPRINT_SERVICE);
        console.log(`\x1b[32m✔ [blueprint] connected: ${sync.tools} remote tool(s)\x1b[0m`);
      },
      onChat: assistant
        ? async (text: string) => {
            console.log('\x1b[90m… thinking\x1b[0m');
            const reply = await assistant.ask(text);
            if (reply.tools.length) console.log(`\x1b[90m  used: ${reply.tools.join(', ')}\x1b[0m`);
            if (reply.status === 'COMPLETED') {
              console.log(`\x1b[1m\x1b[35m🤖 assistant:\x1b[0m ${reply.answer}\n`);
            } else if (reply.status === 'WAITING_FOR_USER') {
              console.log(`\x1b[33m⏸ The assistant wants to run a tool that needs approval (request #${reply.requestId}).\x1b[0m`);
            } else {
              console.log(`\x1b[31m[assistant ${reply.status}] ${reply.answer}\x1b[0m`);
            }
          }
        : undefined,
    });


    const unsubscribe = channel.on(async (event: any) => {
      const { type, payload } = event;
      if (payload?.state) {
        currentState = payload.state;
      }
      if (type === 'curator:tool_call_result') {
        console.log(`\n\x1b[32m[Tool Output]\x1b[0m`, JSON.stringify(payload, null, 2));
      } else if (type === 'curator:message') {
        console.log(`\n\x1b[35m[Message]\x1b[0m ${payload?.text || JSON.stringify(payload)}`);
      } else if (type === 'curator:exit') {
        await cleanup();
      }
    });

    const boot = async () => {
      if (typeof channel.start === 'function') {
        try {
          await channel.start();
        } catch (err: any) {
          console.error(`\x1b[31m[Start Error] ${err?.message || err}\x1b[0m`);
        }
      }
      shell.start(rl);
      if (runtime) await connectRemote(runtime);
    };

    boot();
  });
}

/** Registers/refreshes the blueprint server; without a session the shell starts the device login. */
async function connectRemote(runtime: BlueprintRuntime): Promise<void> {
  if (!runtime.auth) {
    console.log('\x1b[33m[blueprint] CLIENT_ID_BLUEPRINT is not set: remote tools are unavailable.\x1b[0m');
    return;
  }
  try {
    const result = await connectBlueprintServer(runtime);
    if (result.sync) {
      console.log(`\x1b[32m✔ [blueprint] connected to ${result.server.url}: ${result.sync.tools} remote tool(s)\x1b[0m`);
    } else if (result.error?.code !== 'AUTH_REQUIRED') {
      console.log(`\x1b[31m[blueprint] ${result.server.url}: ${result.error?.message}\x1b[0m`);
    }
  } catch (err: any) {
    console.log(`\x1b[31m[blueprint] ${err?.message || err}\x1b[0m`);
  }
}

/**
 * Creates a unified BlueprintChannel (WebSocket or Direct SQLite).
 */
export async function createBlueprintChannel(
  options: BlueprintClientOptions = {}
): Promise<BlueprintChannel> {
  if (options.direct) {
    return createDirectSessionChannel(options);
  }
  return createWebSocketChannel(options);
}

/**
 * Primary entry point for running the Blueprint interactive client REPL.
 */
export async function runBlueprintClient(options: BlueprintClientOptions = {}): Promise<void> {
  let channel: BlueprintChannel;
  try {
    channel = await createBlueprintChannel(options);
  } catch (err: any) {
    console.error(`\x1b[31mFailed to connect to server: ${err.message}\x1b[0m`);
    console.log('\x1b[33mTip: Use "--direct" for lightweight in-process SQLite play without a server.\x1b[0m');
    return;
  }

  await runBlueprintClientUi(channel, options.userName);
}
