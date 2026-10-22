import readline from 'node:readline';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  createClientShell,
  type ReplCommand,
} from '@curator/host';
import { KEERIS_WHITELISTED_TOOLS } from '../plugins/keerisTools.ts';
import { ServerClientAdapter, getServerBaseUrl } from '../adapters/server-adapter.ts';

export interface KeerisClientOptions {
  direct?: boolean;
  serverUrl?: string;
  databasePath?: string;
  quiet?: boolean;
}

export type KeerisChannel = CuratorChannel;
export { normalizeWsUrl };

// GraphQL queries - EXACT SAME operations used by the Vue frontend
export const GQL_UNIQUE_TRACKS = `
  query GetUniqueTracks($search: String, $programIds: [ID], $limit: Int) {
    uniqueTracks(search: $search, programIds: $programIds, limit: $limit) {
      id
      artist
      title
      playCount
      firstPlayedAt
      lastPlayedAt
      airings {
        date
        programTitle
        episodeTitle
        episodeUrl
      }
    }
  }
`;

export const GQL_STATS = `
  query GetStats($search: String, $programIds: [ID]) {
    stats(search: $search, programIds: $programIds) {
      episodes
      tracks
      uniqueTracks
      programs
      programBreakdown {
        programId
        programTitle
        episodes
        tracks
        uniqueTracks
      }
    }
  }
`;

export const GQL_AGENTS_OVERVIEW = `
  query GetAgentsOverview {
    curatorAgents {
      id
      name
      schedule
      enabled
      isActive
      episodesCount
      tracksCount
    }
  }
`;

export const GQL_TRIGGER_AGENT = `
  mutation TriggerAgent($name: String!, $refresh: Boolean) {
    triggerCuratorAgent(name: $name, refresh: $refresh) {
      id
      content
      createdAt
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Tool-Derived REPL Commands (Mirroring Poker architecture)
// Kept in client UI layer: formats results with ANSI colors for the terminal
// ─────────────────────────────────────────────────────────────────────────────
export const KEERIS_COMMANDS: ReplCommand[] = [
  {
    name: 'search',
    usage: '<term...>',
    aliases: ['find', 's'],
    description: 'Search unique tracks (tool: keeris_search_tracks)',
    execute: async (_rawArgs, tokens, ctx: any) => {
      const query = (tokens.join(' ') || _rawArgs || '').trim();
      if (!query) {
        console.log('\x1b[33mUsage: search <artist or title>\x1b[0m');
        return;
      }
      try {
        const data: any = await ctx.executeQuery(GQL_UNIQUE_TRACKS, { search: query, limit: 15 });
        const tracks = data?.uniqueTracks || [];
        if (tracks.length === 0) {
          console.log(`\x1b[33mNo tracks found matching "${query}".\x1b[0m`);
          return;
        }
        console.log(`\n\x1b[1m\x1b[36mFound ${tracks.length} matching tracks:\x1b[0m`);
        for (const t of tracks) {
          const airing = t.airings?.[0] ? ` [${t.airings[0].programTitle || 'Show'}]` : '';
          console.log(`  • \x1b[36m${t.artist || 'Unknown'}\x1b[0m - \x1b[37m${t.title || 'Untitled'}\x1b[0m (\x1b[32m${t.playCount || 1} plays\x1b[0m)${airing}`);
        }
        console.log('');
      } catch (err: any) {
        console.error(`\x1b[31mSearch failed: ${err.message}\x1b[0m`);
      }
    },
  },
  {
    name: 'stats',
    description: 'Display archive statistics (tool: keeris_get_stats)',
    execute: async (_rawArgs, _tokens, ctx: any) => {
      try {
        const data: any = await ctx.executeQuery(GQL_STATS, {});
        const stats = data?.stats;
        console.log('\n\x1b[1m\x1b[36m=== Keeris Archive Statistics ===\x1b[0m');
        console.log(`Episodes:     \x1b[32m${Number(stats?.episodes || 0).toLocaleString()}\x1b[0m`);
        console.log(`Airings:      \x1b[32m${Number(stats?.tracks || 0).toLocaleString()}\x1b[0m`);
        console.log(`Unique Songs: \x1b[32m${Number(stats?.uniqueTracks || 0).toLocaleString()}\x1b[0m`);
        console.log(`Programs:     \x1b[32m${Number(stats?.programs || 0).toLocaleString()}\x1b[0m\n`);
      } catch (err: any) {
        console.error(`\x1b[31mStats failed: ${err.message}\x1b[0m`);
      }
    },
  },
  {
    name: 'agents',
    aliases: ['status'],
    description: 'Inspect crawler agents (tool: keeris_get_agents)',
    execute: async (_rawArgs, _tokens, ctx: any) => {
      try {
        const data: any = await ctx.executeQuery(GQL_AGENTS_OVERVIEW, {});
        const overview = data?.curatorOverview;
        if (overview) {
          console.log('\n\x1b[1m\x1b[36m=== Curator Engine Overview ===\x1b[0m');
          console.log(`Processor Status: ${overview?.isProcessorPaused ? '\x1b[33mPAUSED\x1b[0m' : '\x1b[32mACTIVE\x1b[0m'}`);
          console.log(`Active Agents:    \x1b[32m${overview?.activeAgentsCount ?? 0}\x1b[0m`);
          console.log(`Total Requests:   \x1b[32m${overview?.totalRequestsCount ?? 0}\x1b[0m`);
          console.log(`Available Tools:  \x1b[32m${overview?.toolsCount ?? 0}\x1b[0m\n`);
        } else {
          console.log('\n\x1b[1m\x1b[36m=== Registered Curator Agents ===\x1b[0m');
        }
        const agents = data?.curatorAgents || [];
        console.log('Agent Name'.padEnd(38) + 'Enabled'.padEnd(10) + 'Schedule'.padEnd(16) + 'Episodes'.padStart(10) + 'Tracks'.padStart(10));
        console.log('─'.repeat(84));
        for (const a of agents) {
          const enabledStr = a.enabled ? '\x1b[32myes\x1b[0m' : '\x1b[90mno\x1b[0m';
          console.log(
            a.name.slice(0, 36).padEnd(38) +
            enabledStr.padEnd(19) +
            (a.schedule || 'manual').padEnd(16) +
            String(a.episodesCount ?? 0).padStart(10) +
            String(a.tracksCount ?? 0).padStart(10)
          );
        }
        console.log('─'.repeat(84) + '\n');
      } catch (err: any) {
        console.error(`\x1b[31mAgents failed: ${err.message}\x1b[0m`);
      }
    },
  },
  {
    name: 'trigger',
    usage: '<agentName> [refresh]',
    description: 'Schedule crawler workflow (tool: keeris_trigger_agent)',
    execute: async (_rawArgs, tokens, ctx: any) => {
      const agentName = tokens[0];
      const refresh = tokens.includes('--refresh') || tokens.includes('-r');
      if (!agentName) {
        console.log('\x1b[33mUsage: trigger <agentName> (e.g. trigger vikerraadio_kauamangiv_scrape)\x1b[0m');
        return;
      }
      try {
        const data: any = await ctx.executeQuery(GQL_TRIGGER_AGENT, { name: agentName, refresh });
        console.log(`\x1b[32m✔ Task enqueued:\x1b[0m ${data?.triggerCuratorAgent?.content || 'Queued'}`);
      } catch (err: any) {
        console.error(`\x1b[31mTrigger failed: ${err.message}\x1b[0m`);
      }
    },
  },
  {
    name: 'download',
    usage: '<url> [outputDir]',
    aliases: ['dl', 'audio'],
    description: 'Download episode audio (tool: vikerraadio_download_episode)',
    execute: async (_rawArgs, tokens, ctx: any) => {
      const url = tokens[0];
      const outputDir = tokens[1];
      if (!url) {
        console.log('\x1b[33mUsage: download <episodeUrl> [outputDir]\x1b[0m');
        return;
      }
      console.log(`\x1b[36m[Download] Invoking vikerraadio_download_episode tool...\x1b[0m`);
      try {
        const { keerisDownloadEpisodeTool } = await import('../plugins/keerisTools.ts');
        const res: any = await keerisDownloadEpisodeTool.execute!({ url, outputDir }, { domainDb: ctx.domainDb });
        console.log(`\x1b[32m✔ Download complete:\x1b[0m ${res?.audioUrl || 'Done'}`);
      } catch (err: any) {
        console.error(`\x1b[31mDownload tool failed: ${err.message}\x1b[0m`);
      }
    },
  },
];

/**
 * Creates a network-backed channel communicating with an external Curator Server over WebSockets
 * using createHostWebSocketChannel (exact same pattern as poker minigame).
 */
export async function createWebSocketChannel(options: KeerisClientOptions = {}): Promise<CuratorChannel> {
  return createHostWebSocketChannel({
    serverUrl: options.serverUrl || getServerBaseUrl(),
    envUrlKey: 'VITE_SERVER_URL',
    defaultPath: '/api/events',
  });
}

/**
 * Creates a lightweight in-process direct Curator channel hooked directly to host event emitter
 * using createDirectChannel and connected to the EXACT SAME database as the server.
 */
export async function createDirectSessionChannel(
  options: KeerisClientOptions = {},
  existingHost?: CuratorHost
): Promise<CuratorChannel> {
  let host = existingHost;
  if (!host) {
    const { createKeerisHost } = await import('../host.ts');
    const { openDatabase } = await import('../db.ts');
    const { config } = await import('../config.ts');
    const dbTarget = options.databasePath || process.env.DATABASE_URL || process.env.DATABASE_PATH || config.defaultDatabase;
    const domainDb = openDatabase(dbTarget);
    host = await createKeerisHost({ domainDb });
    await host.start(3000);
  }

  const baseChannel = createDirectChannel({
    host,
    close: async () => {
      if (host) await host.stop();
    },
    send: async (type: string, payload?: any) => {
      if (type === 'curator:trigger_agent' && host) {
        await host.triggerAgent(payload?.name, payload?.context || {});
      } else {
        host?.events?.broadcast?.(type, payload);
      }
    },
  });

  return {
    ...baseChannel,
    close: async () => {
      await baseChannel.close();
      if (host) await host.stop();
    },
  };
}

/**
 * Unified factory creating a Keeris CuratorChannel:
 * Either in-process direct channel via createDirectChannel or remote via createHostWebSocketChannel.
 */
export async function createKeerisChannel(
  options: KeerisClientOptions = {},
  existingHost?: CuratorHost
): Promise<CuratorChannel> {
  if (options.direct) {
    return createDirectSessionChannel(options, existingHost);
  }
  return createWebSocketChannel(options);
}

/**
 * Interactive Keeris Client Shell UI runner.
 * Takes a CuratorChannel (in-process or WebSocket) to stream real-time events while using the exact same
 * ServerClientAdapter GraphQL APIs as the Vue frontend for queries and agent executions.
 */
export async function runKeerisClientUi(
  channel: CuratorChannel,
  options: KeerisClientOptions = {},
  existingRl?: readline.Interface,
  directHost?: CuratorHost,
  activeDomainDb?: any
): Promise<void> {
  const serverUrl = options.serverUrl || getServerBaseUrl();
  let domainDb = activeDomainDb || directHost?.config?.domainDb || (directHost as any)?.domainDb;

  // Helper executing GraphQL: in direct mode via domainDb, or remote via ServerClientAdapter
  const executeQuery = async <T = any>(query: string, vars: Record<string, any> = {}): Promise<T> => {
    if (options.direct || !serverUrl) {
      if (!domainDb) {
        const { openDatabase } = await import('../db.ts');
        const { config } = await import('../config.ts');
        const dbTarget = options.databasePath || process.env.DATABASE_URL || process.env.DATABASE_PATH || config.defaultDatabase;
        domainDb = openDatabase(dbTarget);
      }
      const { executeGraphql } = await import('../server/graphql.ts');
      const res = await executeGraphql(domainDb, query, vars, {
        user: { id: 'cli', email: 'system@local', roles: ['curator_manager', 'admin'] },
      });
      if (res.errors?.length) throw new Error(res.errors.map((e: any) => e.message).join(', '));
      return res.data as T;
    }
    const { ServerClientAdapter } = await import('../adapters/server-adapter.ts');
    const adapter = new ServerClientAdapter(serverUrl);
    return await adapter.requestGraphql<T>(query, vars);
  };

  console.log('\n\x1b[1m\x1b[36m====================================================\x1b[0m');
  console.log('\x1b[1m\x1b[36m   🎵 Curator Keeris Music & Radio Archive Client\x1b[0m');
  console.log('\x1b[1m\x1b[36m====================================================\x1b[0m');
  console.log(`Mode:    \x1b[33m${options.direct ? 'Direct In-Process (openDatabase, same database as server)' : `Remote Server at ${serverUrl}`}\x1b[0m`);
  console.log('Channel: \x1b[32m✔ Curator Channel Connected & Interactive\x1b[0m\n');
  console.log('Commands:');
  console.log('  \x1b[33msearch <query>\x1b[0m           Search tracks (tool: keeris_search_tracks)');
  console.log('  \x1b[33mstats\x1b[0m                    Display archive catalog statistics (tool: keeris_get_stats)');
  console.log('  \x1b[33magents\x1b[0m                   Inspect registered crawler agents (tool: keeris_get_agents)');
  console.log('  \x1b[33mtrigger <agentName>\x1b[0m      Trigger crawler agent workflow (tool: keeris_trigger_agent)');
  console.log('  \x1b[33mdownload <url>\x1b[0m           Download episode audio file (tool: vikerraadio_download_episode)');
  console.log('  \x1b[33mtools\x1b[0m                    List all whitelisted Curator tools');
  console.log('  \x1b[33mexec <toolName> [args]\x1b[0m  Execute any whitelisted tool with JSON arguments');
  console.log('  \x1b[33mhelp\x1b[0m                     Show available commands and tool usage');
  console.log('  \x1b[33mexit\x1b[0m / \x1b[33mquit\x1b[0m              Exit client\n');

  const rl =
    existingRl ||
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

  return new Promise((resolve) => {
    const cleanup = async () => {
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

    // Subscribe to real-time events from the Curator Engine channel (in-process or remote WS)
    const unsubscribe = channel.on((event: any) => {
      const { type, payload } = event;
      if (type === 'log') {
        const msg = payload?.message || payload;
        console.log(`\x1b[90m[Curator Log] ${msg}\x1b[0m`);
      } else if (type === 'error') {
        console.error(`\x1b[31m[Curator Error] ${payload?.message || payload}\x1b[0m`);
      } else if (type === 'request_start') {
        console.log(`\x1b[35m[Curator Engine] Request #${payload?.requestId} started (${payload?.agent || 'workflow'})\x1b[0m`);
      } else if (type === 'request_complete') {
        console.log(`\x1b[32m✔ [Curator Engine] Request #${payload?.requestId} completed with status: ${payload?.status}\x1b[0m`);
      } else if (type === 'database_change') {
        const tables = payload?.tables?.join(', ') || 'tables';
        console.log(`\x1b[36m⚡ [Database Change] Updated: ${tables}\x1b[0m`);
      }
    });

    const shellConfig: any = {
      channel,
      actorName: 'User',
      prompt: '\x1b[1m\x1b[35mkeeris>\x1b[0m ',
      commands: KEERIS_COMMANDS,
      tools: KEERIS_WHITELISTED_TOOLS,
      defaultToolName: 'keeris_search_tracks',
      onSpeech: async (text: string) => {
        const query = text.trim();
        if (!query) return;
        console.log(`\x1b[36m[Keeris] Searching tracks for "${query}"...\x1b[0m`);
        try {
          const data: any = await executeQuery(GQL_UNIQUE_TRACKS, { search: query, limit: 15 });
          const tracks = data?.uniqueTracks || [];
          if (tracks.length === 0) {
            console.log(`\x1b[33mNo tracks found matching "${query}".\x1b[0m\n`);
            return;
          }
          console.log(`\n\x1b[1m\x1b[36mFound ${tracks.length} matching tracks:\x1b[0m`);
          for (const t of tracks) {
            const airing = t.airings?.[0] ? ` [${t.airings[0].programTitle || 'Show'}]` : '';
            console.log(`  • \x1b[36m${t.artist || 'Unknown'}\x1b[0m - \x1b[37m${t.title || 'Untitled'}\x1b[0m (\x1b[32m${t.playCount || 1} plays\x1b[0m)${airing}`);
          }
          console.log('');
        } catch (err: any) {
          console.error(`\x1b[31mSearch failed: ${err.message}\x1b[0m`);
        }
      },
      onToolCall: async (toolName: string, args: Record<string, any>, ctx?: any) => {
        const found = KEERIS_WHITELISTED_TOOLS.find(
          (t) => (typeof t === 'string' ? t : t.name) === toolName
        );
        if (!found) {
          throw new Error(`Tool "${toolName}" is not whitelisted in Keeris shell context.`);
        }
        if (options.direct) {
          // Every tool call is a Request (RBAC, approval, Response) — no direct function calls.
          if (!directHost) {
            throw new Error(`Tool "${toolName}" needs the Curator host (failed to boot); tool calls are only executed as Requests.`);
          }
          const { status, requestId, result } = await directHost.runTool(toolName, args || {}, { origin: 'REPL' });
          if (status === 'WAITING_FOR_USER') {
            console.log(`\x1b[33m⏸ [Tool "${toolName}"] awaiting approval (request #${requestId})\x1b[0m`);
            return { status, requestId };
          }
          return result;
        } else {
          if (channel) {
            return await channel.send('curator:tool_call', {
              tool: toolName,
              args,
            });
          }
        }
        throw new Error(`Tool "${toolName}" has no execution handler.`);
      },
    };

    shellConfig.executeQuery = executeQuery;
    shellConfig.domainDb = domainDb;
    shellConfig.getState = () => ({ domainDb, channel });

    const shell = createClientShell(shellConfig);
    shell.start(rl);
  });
}

/**
 * Primary entry point for running the Keeris Client in terminal.
 * Either connects to the remote server over WebSockets (createHostWebSocketChannel)
 * or creates an in-process direct execution channel (createDirectChannel) using the same DB as the server.
 */
export async function runKeerisClient(options: KeerisClientOptions = {}): Promise<void> {
  let channel: CuratorChannel | undefined;
  let directHost: CuratorHost | undefined;
  let domainDb: any;

  if (!options.direct) {
    const serverUrl = options.serverUrl || getServerBaseUrl();
    console.log(`\x1b[36m[Keeris Client] Connecting to Curator Server over WebSocket (${serverUrl})...\x1b[0m`);
    try {
      channel = await createWebSocketChannel(options);
    } catch (err: any) {
      console.log(`\x1b[33m[Keeris Client] Server offline at ${serverUrl}. Seamlessly operating in direct in-process database mode...\x1b[0m`);
      options.direct = true;
    }
  }

  if (options.direct) {
    const { openDatabase } = await import('../db.ts');
    const { config } = await import('../config.ts');
    const dbTarget = options.databasePath || process.env.DATABASE_URL || process.env.DATABASE_PATH || config.defaultDatabase;
    console.log(`\x1b[36m[Keeris Client] Initializing direct database connection (${dbTarget.replace(/:[^:@]+@/, ':****@')})...\x1b[0m`);
    domainDb = openDatabase(dbTarget);

    try {
      const { createKeerisHost } = await import('../host.ts');
      directHost = await createKeerisHost({ domainDb });
      await directHost.start(3000);
      channel = await createDirectSessionChannel(options, directHost);
    } catch (hostErr: any) {
      // If full Curator agent host cannot boot, maintain client responsiveness via in-process local channel
      const EventEmitter = (await import('node:events')).default;
      const ee = new EventEmitter();
      channel = {
        sessionId: 'direct-client',
        on: (fn: any) => {
          ee.on('event', fn);
          return () => ee.off('event', fn);
        },
        send: async (type: string, payload?: any) => {
          ee.emit('event', { type, payload });
        },
        close: async () => {
          if (domainDb && typeof domainDb.close === 'function') {
            await domainDb.close();
          }
        },
      };
    }
  }

  if (!channel) {
    throw new Error('Unable to initialize Keeris client channel');
  }

  await runKeerisClientUi(channel, options, undefined, directHost, domainDb);
}
