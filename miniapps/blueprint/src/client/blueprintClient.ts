import readline from 'node:readline';
import {
  type CuratorChannel,
  type CuratorHost,
  createWebSocketChannel as createHostWebSocketChannel,
  createDirectChannel,
  normalizeWsUrl,
} from '@curator/host';
import type { McpConnectResult } from '../../../../packages/plugin-mcp-client/dist/index.js';
import { createBlueprintRuntime, startMcpServers, type BlueprintRuntime } from '../host.js';
import { createAssistant } from '../harness/assistant.js';
import { createChat, listChats } from '../harness/chatSessions.js';
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
  // The person at the terminal is the actor: tools, chats and roles are theirs, not the system user's.
  const runtime = await createBlueprintRuntime({
    databasePath: options.databasePath,
    actor: { displayName: options.userName },
  });
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
        // Remote aliases (`mcp.<server>.<tool>`) resolve per project, like host.runTool does.
        if (host.engine.resolveTool?.(tool, { projectId: host.project.id }) ?? host.engine.tools.get(tool)) {
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
      runtime.reconciler.stop();
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
      // `/auth login` runs as the host's auth_login flow; its auth:login event resumes the connector flows.
      auth: runtime?.shellAuth ?? undefined,
      remoteTools: runtime
        ? () =>
            runtime.registry
              .listToolAliases(runtime.host.project.id)
              .map(({ name, tool }) => ({ name, description: tool.description, parameters: (tool as any).parameters }))
        : undefined,
      onChat: assistant
        ? async (text: string) => {
            // A new chat gets its Conversation on the first message.
            if (assistant.conversationId === undefined) assistant.useConversation(await createChat(runtime!.host));
            console.log('\x1b[90m… thinking\x1b[0m');
            const reply = await assistant.ask(text);
            if (reply.tools.length) console.log(`\x1b[90m  used: ${reply.tools.join(', ')}\x1b[0m`);
            for (const { tool, display } of reply.shown) console.log(`\x1b[90m  ${tool} → ${display}\x1b[0m`);
            if (reply.status === 'COMPLETED') {
              console.log(`\x1b[1m\x1b[35m🤖 assistant:\x1b[0m ${reply.answer}\n`);
            } else if (reply.status === 'WAITING_FOR_USER') {
              console.log(`\x1b[33m⏸ The assistant wants to run a tool that needs approval (request #${reply.requestId}).\x1b[0m`);
            } else {
              console.log(`\x1b[31m[assistant ${reply.status}] ${reply.answer}\x1b[0m`);
            }
          }
        : undefined,
      extraCommands: assistant
        ? [
            {
              name: 'history',
              usage: '/history [full|answers]',
              description: 'How earlier turns reach the assistant: full (with tool calls and results) or answers only',
              execute: (args: string) => {
                const profile = args.trim();
                if (profile && profile !== 'full' && profile !== 'answers') {
                  console.log('\x1b[31mUsage: /history [full|answers]\x1b[0m');
                } else if (profile) {
                  assistant.useHistoryProfile(profile);
                }
                console.log(`\x1b[36m[History]\x1b[0m ${assistant.historyProfile ?? 'full'}`);
              },
            },
          ]
        : undefined,
    });


    // Events arrive while the prompt is showing: print them above it.
    const unsubscribe = channel.on(async (event: any) => {
      const { type, payload } = event;
      if (payload?.state) {
        currentState = payload.state;
      }
      if (type === 'curator:tool_call_result') {
        shell.printAsync(`\n\x1b[32m[Tool Output]\x1b[0m ${JSON.stringify(payload, null, 2)}`);
      } else if (type === 'curator:message') {
        shell.printAsync(`\n\x1b[35m[Message]\x1b[0m ${payload?.text || JSON.stringify(payload)}`);
      } else if (type === 'mcp:status') {
        shell.printAsync(formatMcpStatus(payload));
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
      if (runtime && assistant) await chooseChat(runtime.host, rl, assistant);
      shell.start(rl);
      if (runtime) await connectRemote(runtime, (line) => shell.printAsync(line));
    };

    boot();
  });
}

/** Asks whether to resume an earlier chat or start a new one (Enter = new). */
async function chooseChat(
  host: CuratorHost,
  rl: readline.Interface,
  assistant: ReturnType<typeof createAssistant>
): Promise<void> {
  const chats = await listChats(host);
  if (chats.length === 0) return;

  console.log('\x1b[36mEarlier chats:\x1b[0m');
  chats.forEach((c, i) => {
    const when = c.lastActiveAt.toLocaleString();
    console.log(`  \x1b[1m[${i + 1}]\x1b[0m ${when} · ${c.turns} turn(s) · ${c.title || '(no message)'}`);
  });
  const answer = await new Promise<string>((resolve) =>
    rl.question(`Resume a chat (1-${chats.length}) or press Enter for a new one: `, resolve)
  );
  const picked = chats[Number(answer.trim()) - 1];
  if (picked) {
    assistant.useConversation(picked.conversationId);
    console.log(`\x1b[90mResuming chat #${picked.conversationId}.\x1b[0m\n`);
  } else {
    console.log('\x1b[90mStarting a new chat.\x1b[0m\n');
  }
}

/** Registers the configured MCP servers; they connect in the background (see `mcp:status`). */
async function connectRemote(runtime: BlueprintRuntime, print: (line: string) => void): Promise<void> {
  try {
    for (const { server, missing } of await startMcpServers(runtime)) {
      print(`\x1b[33m[${server}] ${missing} is not set: remote tools are unavailable.\x1b[0m`);
    }
  } catch (err: any) {
    print(`\x1b[31m[mcp] ${err?.message || err}\x1b[0m`);
  }
}

function formatMcpStatus(event: McpConnectResult): string {
  const { server, status, error, tools, retryInSeconds } = event;
  if (status === 'connected') return `\x1b[32m✔ [${server}] connected: ${tools ?? 0} remote tool(s)\x1b[0m`;
  if (status === 'auth_required') return `\x1b[33m[${server}] waiting for sign-in (/auth login)\x1b[0m`;
  const retry = retryInSeconds ? `, retrying in ${retryInSeconds}s` : '';
  return `\x1b[31m[${server}] ${error || status}${retry}\x1b[0m`;
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

  await runBlueprintClientUi(channel, channel.runtime?.host.user?.name ?? options.userName);
}
