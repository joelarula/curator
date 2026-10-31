import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

// Guarantee exact same environment loading as server
const currentDir = dirname(fileURLToPath(import.meta.url));
const keerisRoot = dirname(currentDir);
const envCandidates = [
  join(keerisRoot, '.env'),
  join(process.cwd(), '.env'),
  join(keerisRoot, '.env.production'),
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
      break;
    } catch {}
  }
}

import {
  type CuratorChannel,
  type CuratorHost,
  createWebSocketChannel as createHostWebSocketChannel,
  createDirectChannel,
  normalizeWsUrl,
} from '@curator/host';
import {
  createKeerisClientShell,
  renderKeerisEvent,
  KEERIS_COMMANDS,
  KEERIS_WHITELISTED_TOOLS,
} from './keerisClientShell.ts';
import { KeerisConstant } from '../models/index.ts';
import { getServerBaseUrl } from '../adapters/server-adapter.ts';
import { config } from '../config.ts';

export {
  KEERIS_COMMANDS,
  KEERIS_WHITELISTED_TOOLS,
  createKeerisClientShell,
  renderKeerisEvent,
  normalizeWsUrl,
};

// Re-export queries from models for backward compatibility
export {
  GQL_UNIQUE_TRACKS,
  GQL_STATS,
  GQL_AGENTS_OVERVIEW,
  GQL_TRIGGER_AGENT,
} from '../models/index.ts';

export interface KeerisClientOptions {
  direct?: boolean;
  drive?: 'step' | 'processor';
  pollInterval?: number;
  serverUrl?: string;
  databasePath?: string;
  userName?: string;
  quiet?: boolean;
  logLevel?: string;
  profiles?: string | string[];
  configPath?: string;
}

export type KeerisChannel = CuratorChannel & {
  host?: CuratorHost;
  runTool?(toolName: string, args?: Record<string, any>): Promise<any>;
};

/**
 * Creates a network-backed channel communicating with an external Curator Server over WebSockets.
 */
export async function createWebSocketChannel(options: KeerisClientOptions = {}): Promise<KeerisChannel> {
  const serverUrl = options.serverUrl || getServerBaseUrl() || KeerisConstant.DEFAULT_SERVER_URL;
  return createHostWebSocketChannel({
    serverUrl,
    envUrlKey: KeerisConstant.ENV_SERVER_URL,
    defaultPath: KeerisConstant.DEFAULT_WS_PATH,
  });
}

/**
 * Creates a lightweight in-process direct Curator channel.
 * Zero outer APIs, zero network/TCP ports, pure direct AST and Request execution.
 */
export async function createDirectSessionChannel(
  options: KeerisClientOptions = {},
  existingHost?: CuratorHost
): Promise<KeerisChannel> {
  let host = existingHost;
  if (!host) {
    const { createKeerisHost } = await import('../host.ts');
    host = await createKeerisHost({
      databasePath: options.databasePath,
      actor: { displayName: options.userName },
      quiet: options.quiet,
      logLevel: options.logLevel,
      profiles: options.profiles,
      configPath: options.configPath,
    });
  }

  // Drive processor loop unless synchronous step mode is explicitly requested
  if (options.drive !== 'step') {
    await host.start(options.pollInterval ?? 300);
  }

  const directTarget = {
    host,
    send: async (type: string, payload?: any) => {
      host.events.broadcast(type, payload);
      if (type === 'curator:tool_call') {
        const { tool, args } = payload || {};
        if (host.engine.resolveTool?.(tool, { projectId: host.project.id }) ?? host.engine.tools.get(tool)) {
          const { result, status, requestId } = await host.runTool(tool, args || {}, { origin: 'REPL' });
          if (status === 'WAITING_FOR_USER') {
            console.log(`\x1b[33m⏸ [Tool "${tool}"] awaiting approval (request #${requestId})\x1b[0m`);
            return { status, requestId };
          }
          return result;
        }
      }
    },
    close: async () => {
      await host.stop();
    },
  };

  const baseChannel = createDirectChannel(directTarget as any, '1', {
    drive: options.drive === 'step' ? 'step' : 'processor',
  });

  const origClose = baseChannel.close.bind(baseChannel);
  return Object.assign(baseChannel, {
    host,
    runTool: (toolName: string, args: Record<string, any> = {}) =>
      host.runTool(toolName, args, { origin: 'REPL' }),
    close: async () => {
      await origClose();
      if (host) await host.stop();
    },
  });
}

/**
 * Unified factory creating a Keeris CuratorChannel:
 * Either in-process direct channel via createDirectChannel or remote via createWebSocketChannel.
 */
export async function createKeerisChannel(
  options: KeerisClientOptions = {},
  existingHost?: CuratorHost
): Promise<KeerisChannel> {
  if (options.direct) {
    return createDirectSessionChannel(options, existingHost);
  }
  return createWebSocketChannel(options);
}

/**
 * Interactive Keeris Client Shell UI runner.
 * Takes a KeerisChannel and manages continuous asynchronous REPL event loop.
 */
export async function runKeerisClientUi(
  channel: KeerisChannel,
  options: KeerisClientOptions = {},
  existingRl?: readline.Interface,
  directHost?: CuratorHost
): Promise<void> {
  const host = directHost || channel.host;
  const isDirect = Boolean(options.direct || host);
  const serverUrl = options.serverUrl || getServerBaseUrl() || KeerisConstant.DEFAULT_SERVER_URL;

  const dbTarget = options.databasePath || process.env.DATABASE_URL || process.env.DATABASE_PATH || config.defaultDatabase;
  const isMariaDb = typeof dbTarget === 'string' && (dbTarget.startsWith('mysql://') || dbTarget.startsWith('mariadb://'));
  const dbEngine = isMariaDb ? 'MariaDB/MySQL' : 'SQLite';
  const dbTargetMasked = typeof dbTarget === 'string' ? dbTarget.replace(/:[^:@]+@/, ':****@') : 'in-memory';

  console.log('\n\x1b[1m\x1b[36m====================================================\x1b[0m');
  console.log('\x1b[1m\x1b[36m   🎵 Curator Keeris Music & Radio Archive Client\x1b[0m');
  console.log('\x1b[1m\x1b[36m====================================================\x1b[0m');
  console.log(`Mode:     \x1b[33m${isDirect ? `Direct In-Process Host (${dbEngine})` : `Remote Server (${serverUrl})`}\x1b[0m`);
  if (isDirect) {
    console.log(`Database: \x1b[32m${dbEngine}\x1b[0m (${dbTargetMasked})`);
  }
  console.log('Channel:  \x1b[32m✔ Connected & Interactive\x1b[0m\n');
  console.log('Commands:');
  console.log('  \x1b[33msearch <query>\x1b[0m           Search tracks (tool: keeris_search_tracks)');
  console.log('  \x1b[33mstats\x1b[0m                    Display archive catalog statistics (tool: keeris_get_stats)');
  console.log('  \x1b[33magents\x1b[0m                   Inspect registered crawler agents (tool: keeris_get_agents)');
  console.log('  \x1b[33mtrigger <agentName>\x1b[0m      Trigger crawler agent workflow (tool: keeris_trigger_agent)');
  console.log('  \x1b[33mdownload <url>\x1b[0m           Download episode audio (tool: vikerraadio_download_episode)');
  console.log('  \x1b[33mhelp\x1b[0m                     List available tools and commands');
  console.log('  \x1b[33mexit / quit\x1b[0m              Quit client\n');

  const shell = createKeerisClientShell({
    channel,
    actorName: options.userName || KeerisConstant.DEFAULT_ACTOR_NAME,
  });

  return new Promise((resolve) => {
    let closed = false;
    const cleanup = async () => {
      if (closed) return;
      closed = true;
      shell.stop();
      unsubscribe();
      await channel.close();
      resolve();
    };

    process.on('SIGINT', async () => {
      console.log('\n\x1b[33m[Keeris Client] Exiting...\x1b[0m');
      await cleanup();
      process.exit(0);
    });

    // Stream background crawler events above the active REPL prompt
    const unsubscribe = channel.on((event: any) => {
      shell.printAbove(() => renderKeerisEvent(event));
    });

    shell.start();
  });
}

/**
 * Top-level convenience runner for client commands.
 */
export async function runKeerisClient(options: KeerisClientOptions = {}): Promise<void> {
  const channel = await createKeerisChannel(options);
  await runKeerisClientUi(channel, options, undefined, channel.host);
}
