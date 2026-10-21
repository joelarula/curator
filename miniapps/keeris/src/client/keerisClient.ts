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
  directHost?: CuratorHost
): Promise<void> {
  const serverUrl = options.serverUrl || getServerBaseUrl();
  const adapter = new ServerClientAdapter(serverUrl);

  // Helper executing GraphQL: through the server's database in direct mode, or HTTP server in network mode
  const executeQuery = async <T = any>(query: string, vars: Record<string, any> = {}): Promise<T> => {
    const domainDb = directHost?.config?.domainDb || (directHost as any)?.domainDb;
    if (options.direct && domainDb) {
      const { executeGraphql } = await import('../server/graphql.ts');
      const res = await executeGraphql(domainDb, query, vars, {
        user: { id: 'cli', email: 'system@local', roles: ['curator_manager', 'admin'] },
      });
      if (res.errors?.length) throw new Error(res.errors.map((e: any) => e.message).join(', '));
      return res.data as T;
    }
    return adapter.requestGraphql<T>(query, vars);
  };

  console.log('\n\x1b[1m\x1b[36m====================================================\x1b[0m');
  console.log('\x1b[1m\x1b[36m   🎵 Curator Keeris Music & Radio Archive Client\x1b[0m');
  console.log('\x1b[1m\x1b[36m====================================================\x1b[0m');
  console.log(`Mode:    \x1b[33m${options.direct ? 'Direct In-Process (createDirectChannel, same database as server)' : `Remote Server at ${serverUrl} (createHostWebSocketChannel)`}\x1b[0m`);
  console.log('Channel: \x1b[32m✔ Curator Channel Connected & Streaming\x1b[0m\n');
  console.log('Commands:');
  console.log('  \x1b[33msearch <query>\x1b[0m           Search tracks via GraphQL (identical to TrackTable.vue)');
  console.log('  \x1b[33mstats\x1b[0m                    Display archive catalog statistics');
  console.log('  \x1b[33magents\x1b[0m                   Inspect registered crawler agents');
  console.log('  \x1b[33mtrigger <agentName>\x1b[0m      Trigger crawler agent via Curator Engine');
  console.log('  \x1b[33mhelp\x1b[0m                     Show available commands');
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

    // REPL commands using exact frontend GraphQL APIs and channel dispatch
    const commands: ReplCommand[] = [
      {
        name: 'search',
        usage: '<term...>',
        aliases: ['find', 's'],
        description: 'Search unique tracks via GraphQL (identical to TrackTable.vue)',
        execute: async (_rawArgs, tokens) => {
          const query = tokens.join(' ');
          if (!query) {
            console.log('\x1b[33mUsage: search <artist or title>\x1b[0m');
            return;
          }
          try {
            const data: any = await executeQuery(GQL_UNIQUE_TRACKS, { search: query, limit: 15 });
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
        description: 'Display archive statistics via GraphQL (identical to ProgramSummary.vue)',
        execute: async () => {
          try {
            const data: any = await executeQuery(GQL_STATS);
            const s = data?.stats;
            console.log('\n\x1b[1m=== Keeris Archive Statistics ===\x1b[0m');
            console.log(`Episodes:     \x1b[32m${Number(s?.episodes || 0).toLocaleString()}\x1b[0m`);
            console.log(`Airings:      \x1b[32m${Number(s?.tracks || 0).toLocaleString()}\x1b[0m`);
            console.log(`Unique Songs: \x1b[32m${Number(s?.uniqueTracks || 0).toLocaleString()}\x1b[0m`);
            console.log(`Programs:     \x1b[32m${Number(s?.programs || 0).toLocaleString()}\x1b[0m\n`);
          } catch (err: any) {
            console.error(`\x1b[31mStats failed: ${err.message}\x1b[0m`);
          }
        },
      },
      {
        name: 'agents',
        description: 'Inspect registered crawler agents and overview via GraphQL',
        execute: async () => {
          try {
            const data: any = await executeQuery(GQL_AGENTS_OVERVIEW);
            const overview = data?.curatorOverview;
            const agents = data?.curatorAgents || [];
            console.log('\n\x1b[1m=== Curator Engine Status ===\x1b[0m');
            console.log(`Processor: ${overview?.isProcessorPaused ? '\x1b[33mPAUSED\x1b[0m' : '\x1b[32mACTIVE\x1b[0m'}`);
            console.log(`Agents:    ${overview?.activeAgentsCount ?? 0} active (${agents.length} registered)`);
            console.log(`Requests:  ${overview?.totalRequestsCount ?? 0} total, ${overview?.pendingRequestsCount ?? 0} pending\n`);
            for (const a of agents) {
              const status = a.enabled ? '\x1b[32menabled\x1b[0m' : '\x1b[90mdisabled\x1b[0m';
              console.log(`  • \x1b[36m${a.name.padEnd(38)}\x1b[0m [${status}] (${a.episodesCount ?? 0} ep, ${a.tracksCount ?? 0} tracks)`);
            }
            console.log('');
          } catch (err: any) {
            console.error(`\x1b[31mAgents query failed: ${err.message}\x1b[0m`);
          }
        },
      },
      {
        name: 'trigger',
        usage: '<agentName>',
        description: 'Schedule crawler workflow via Curator Engine Channel (identical to Console enqueueAgent)',
        execute: async (_rawArgs, tokens) => {
          const agentName = tokens[0];
          if (!agentName) {
            console.log('\x1b[33mUsage: trigger <agentName> (e.g. trigger vikerraadio_kauamangiv_scrape)\x1b[0m');
            return;
          }
          try {
            await channel.send('curator:trigger_agent', { name: agentName, refresh: false });
            const data: any = await executeQuery(GQL_TRIGGER_AGENT, { name: agentName, refresh: false });
            console.log(`\x1b[32m✔ Task enqueued:\x1b[0m ${data?.triggerCuratorAgent?.content || 'Queued'}`);
          } catch (err: any) {
            console.error(`\x1b[31mTrigger failed: ${err.message}\x1b[0m`);
          }
        },
      },
    ];

    const shell = createClientShell({
      channel,
      actorName: 'User',
      prompt: '\x1b[1m\x1b[35mkeeris>\x1b[0m ',
      commands,
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
    });

    shell.start(rl);
  });
}

/**
 * Primary entry point for running the Keeris Client in terminal.
 * Either connects to the remote server over WebSockets (createHostWebSocketChannel)
 * or creates an in-process direct execution channel (createDirectChannel) using the same DB as the server.
 */
export async function runKeerisClient(options: KeerisClientOptions = {}): Promise<void> {
  let channel: CuratorChannel;
  let directHost: CuratorHost | undefined;

  if (options.direct) {
    const { createKeerisHost } = await import('../host.ts');
    const { openDatabase } = await import('../db.ts');
    const { config } = await import('../config.ts');
    const dbTarget = options.databasePath || process.env.DATABASE_URL || process.env.DATABASE_PATH || config.defaultDatabase;
    console.log(`\x1b[36m[Keeris Client] Initializing direct in-process Curator host (same DB as server: ${dbTarget.replace(/:[^:@]+@/, ':****@')})...\x1b[0m`);
    const domainDb = openDatabase(dbTarget);
    directHost = await createKeerisHost({ domainDb });
    await directHost.start(3000);
    channel = await createDirectSessionChannel(options, directHost);
  } else {
    const serverUrl = options.serverUrl || getServerBaseUrl();
    console.log(`\x1b[36m[Keeris Client] Connecting to Curator Server over WebSocket (createHostWebSocketChannel at ${serverUrl})...\x1b[0m`);
    try {
      channel = await createWebSocketChannel(options);
    } catch (err: any) {
      console.error(`\x1b[31mFailed to connect to server: ${err.message}\x1b[0m`);
      console.log('\x1b[33mTip: Use "node src/cli.ts play --direct" for lightweight in-process execution without a server.\x1b[0m');
      return;
    }
  }

  await runKeerisClientUi(channel, options, undefined, directHost);
}
