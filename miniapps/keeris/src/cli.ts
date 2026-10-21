#!/usr/bin/env node
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

import { Command } from 'commander';
import { ServerClientAdapter, getServerBaseUrl } from './adapters/server-adapter.ts';
import {
  GQL_UNIQUE_TRACKS,
  GQL_STATS,
  GQL_AGENTS_OVERVIEW,
  GQL_TRIGGER_AGENT,
} from './client/keerisClient.ts';

const program = new Command();

program
  .name('keeris')
  .description('Curator Keeris Music & Radio Client CLI (uses exact same APIs as frontend & channel as poker)')
  .version('1.0.0')
  .option('-s, --server <url>', 'Server endpoint URL', process.env.VITE_SERVER_URL || process.env.SERVER_URL || getServerBaseUrl() || 'http://localhost:4001')
  .option('--direct', 'Run direct lightweight in-process execution mode locally (using same database as server)', false)
  .option('-d, --db <path>', 'Custom database URL or path for direct mode');

/**
 * Universal GraphQL query executor:
 * - In network mode (default): queries remote server via ServerClientAdapter (identical to Vue frontend).
 * - In direct mode (--direct): executes in-process against the EXACT SAME database as the server.
 */
async function executeGql<T = any>(
  cmdOpts: any,
  query: string,
  variables: Record<string, any> = {}
): Promise<T> {
  const globalOpts = program.opts();
  const isDirect = Boolean(cmdOpts.direct || globalOpts.direct);

  if (!isDirect) {
    const serverUrl = cmdOpts.server || globalOpts.server || getServerBaseUrl() || 'http://localhost:4001';
    const adapter = new ServerClientAdapter(serverUrl);
    try {
      return await adapter.requestGraphql<T>(query, variables);
    } catch (err: any) {
      // If server is not running or unreachable, seamlessly fall back to direct in-process database execution
      const isConnectionError =
        err.message?.includes('fetch failed') ||
        err.message?.includes('ECONNREFUSED') ||
        err.code === 'ECONNREFUSED' ||
        err.cause?.code === 'ECONNREFUSED';

      if (!isConnectionError) {
        throw err;
      }
    }
  }

  // Direct in-process execution using active database (same database as server)
  const { openDatabase } = await import('./db.ts');
  const { executeGraphql } = await import('./server/graphql.ts');
  const { config } = await import('./config.ts');
  const dbTarget = cmdOpts.db || globalOpts.db || process.env.DATABASE_URL || process.env.DATABASE_PATH || config.defaultDatabase;
  const db = openDatabase(dbTarget);
  try {
    const res = await executeGraphql(db, query, variables, {
      user: { id: 'cli', email: 'system@local', roles: ['curator_manager', 'admin'] },
    });
    if (res.errors?.length) {
      throw new Error(res.errors.map((e: any) => e.message).join(', '));
    }
    return res.data as T;
  } finally {
    if (typeof db.close === 'function') await db.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Play / Client command (Single interactive REPL: direct in-process or remote network client)
// ─────────────────────────────────────────────────────────────────────────────
program
  .command('play', { isDefault: true })
  .aliases(['client', 'interactive', 'repl', 'i'])
  .description('Interactive Keeris client REPL (network client or lightweight direct execution)')
  .option('--direct', 'Run direct lightweight in-process execution mode locally (same database as server)', false)
  .option('-s, --server <url>', 'Curator server URL', process.env.VITE_SERVER_URL || process.env.SERVER_URL || getServerBaseUrl() || 'http://localhost:4001')
  .option('-d, --db <path>', 'Custom database URL or path for direct mode')
  .action(async (options) => {
    const globalOpts = program.opts();
    const isDirect = Boolean(options.direct || globalOpts.direct);
    const serverUrl = options.server || globalOpts.server || getServerBaseUrl() || 'http://localhost:4001';
    const { runKeerisClient } = await import('./client/keerisClient.ts');

    if (isDirect) {
      console.log('\x1b[36m[Keeris CLI] Launching direct lightweight in-process execution...\x1b[0m');
      await runKeerisClient({
        direct: true,
        databasePath: options.db || globalOpts.db,
      });
    } else {
      console.log(`\x1b[36m[Keeris CLI] Connecting to Curator Server at ${serverUrl}...\x1b[0m`);
      await runKeerisClient({
        direct: false,
        serverUrl,
      });
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 2. Search (uses exact GetUniqueTracks GraphQL query from TrackTable.vue)
// ─────────────────────────────────────────────────────────────────────────────
program
  .command('search [query...]')
  .aliases(['find', 's'])
  .description('Search unique song recordings or tracks via GraphQL (identical to TrackTable.vue)')
  .option('--direct', 'Run direct in-process execution mode using the server database', false)
  .option('-a, --artist <name>', 'Filter by artist name')
  .option('-l, --limit <number>', 'Maximum results limit', '25')
  .option('-j, --json', 'Output raw JSON payload')
  .action(async (queryParam, options) => {
    const searchTerm = (Array.isArray(queryParam) ? queryParam.join(' ') : queryParam) || options.artist || '';

    try {
      const data: any = await executeGql(options, GQL_UNIQUE_TRACKS, {
        search: searchTerm,
        limit: Number(options.limit) || 25,
      });

      const tracks = data?.uniqueTracks || [];

      if (options.json) {
        console.log(JSON.stringify(tracks, null, 2));
        return;
      }

      if (tracks.length === 0) {
        console.log(`\x1b[33mNo tracks found matching "${searchTerm}".\x1b[0m`);
        return;
      }

      console.log(`\n\x1b[1m\x1b[36m=== Curator Keeris Music Search (${tracks.length} tracks) ===\x1b[0m\n`);
      const idW = 8, artistW = 28, titleW = 32, playsW = 7, airingW = 35;
      console.log(
        'ID'.padEnd(idW) +
        'Artist'.padEnd(artistW) +
        'Title'.padEnd(titleW) +
        'Plays'.padStart(playsW) +
        '   ' +
        'Latest Airing'.padEnd(airingW)
      );
      console.log('─'.repeat(idW + artistW + titleW + playsW + airingW + 3));

      for (const t of tracks) {
        const id = String(t.id).padEnd(idW);
        const artist = (t.artist || 'Unknown').slice(0, artistW - 2).padEnd(artistW);
        const title = (t.title || 'Untitled').slice(0, titleW - 2).padEnd(titleW);
        const plays = String(t.playCount || 0).padStart(playsW);
        let airing = '—';
        if (t.airings?.length) {
          const a = t.airings[0];
          airing = `${a.date ? String(a.date).slice(0, 10) : ''} [${a.programTitle || 'Show'}]`;
        }
        console.log(
          `\x1b[90m${id}\x1b[0m` +
          `\x1b[36m${artist}\x1b[0m` +
          `\x1b[37m${title}\x1b[0m` +
          `\x1b[32m${plays}\x1b[0m   ` +
          `\x1b[90m${airing.slice(0, airingW - 1)}\x1b[0m`
        );
      }
      console.log('─'.repeat(idW + artistW + titleW + playsW + airingW + 3) + '\n');
    } catch (err: any) {
      console.error(`\x1b[31m[Keeris Error]\x1b[0m ${err.message}`);
      process.exitCode = 1;
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 3. Stats (uses exact GetStats GraphQL query from TrackTable & ProgramSummary)
// ─────────────────────────────────────────────────────────────────────────────
program
  .command('stats')
  .description('Display catalog & program statistics via GraphQL (identical to ProgramSummary.vue)')
  .option('--direct', 'Run direct in-process execution mode using the server database', false)
  .option('-j, --json', 'Output raw JSON payload')
  .action(async (options) => {
    try {
      const data: any = await executeGql(options, GQL_STATS);
      const stats = data?.stats;

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
        return;
      }

      console.log('\n\x1b[1m\x1b[36m=== Curator Keeris Archive Statistics ===\x1b[0m');
      console.log(`Total Episodes: \x1b[32m${Number(stats?.episodes || 0).toLocaleString()}\x1b[0m`);
      console.log(`Total Airings:  \x1b[32m${Number(stats?.tracks || 0).toLocaleString()}\x1b[0m`);
      console.log(`Unique Tracks:  \x1b[32m${Number(stats?.uniqueTracks || 0).toLocaleString()}\x1b[0m`);
      console.log(`Programs:       \x1b[32m${Number(stats?.programs || 0).toLocaleString()}\x1b[0m`);

      if (stats?.programBreakdown?.length) {
        console.log('\n=== Program Breakdown ===');
        console.log('─────────────────────────────────────────────────────────────────────────────');
        console.log('Program'.padEnd(35) + 'Episodes'.padStart(12) + 'Airings'.padStart(12) + 'Unique Tracks'.padStart(16));
        console.log('─────────────────────────────────────────────────────────────────────────────');
        for (const item of stats.programBreakdown) {
          console.log(
            item.programTitle.padEnd(35) +
            item.episodes.toLocaleString().padStart(12) +
            item.tracks.toLocaleString().padStart(12) +
            item.uniqueTracks.toLocaleString().padStart(16)
          );
        }
        console.log('─────────────────────────────────────────────────────────────────────────────\n');
      }
    } catch (err: any) {
      console.error(`\x1b[31m[Keeris Error]\x1b[0m ${err.message}`);
      process.exitCode = 1;
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 4. Agents / Status (uses exact GetAgentsOverview GraphQL query from CuratorConsole)
// ─────────────────────────────────────────────────────────────────────────────
program
  .command('agents')
  .aliases(['status'])
  .description('Inspect registered Curator agents & engine status via GraphQL')
  .option('--direct', 'Run direct in-process execution mode using the server database', false)
  .option('-j, --json', 'Output raw JSON payload')
  .action(async (options) => {
    try {
      const data: any = await executeGql(options, GQL_AGENTS_OVERVIEW);
      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

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
      console.error(`\x1b[31m[Keeris Error]\x1b[0m ${err.message}`);
      process.exitCode = 1;
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 5. Trigger Agent (uses exact triggerCuratorAgent mutation as Console enqueueAgent)
// ─────────────────────────────────────────────────────────────────────────────
program
  .command('trigger <agentName>')
  .description('Schedule an agent workflow request via Curator Engine GraphQL API')
  .option('--direct', 'Run direct in-process execution mode using the server database', false)
  .option('-r, --refresh', 'Refresh already indexed episodes', false)
  .action(async (agentName, options) => {
    try {
      console.log(`[Keeris Client] Dispatching triggerCuratorAgent mutation for '${agentName}'...`);
      const data: any = await executeGql(options, GQL_TRIGGER_AGENT, {
        name: agentName,
        refresh: Boolean(options.refresh),
      });

      console.log(`\x1b[32m✔ Task scheduled on Curator Engine:\x1b[0m`);
      console.log(JSON.stringify(data?.triggerCuratorAgent, null, 2));
    } catch (err: any) {
      console.error(`\x1b[31m[Keeris Error]\x1b[0m ${err.message}`);
      process.exitCode = 1;
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 6. Export (Queries tracks via GraphQL API, no direct raw SQL)
// ─────────────────────────────────────────────────────────────────────────────
program
  .command('export')
  .description('Export tracks to CSV format via GraphQL API')
  .option('--direct', 'Run direct in-process execution mode using the server database', false)
  .option('-o, --output <path>', 'CSV output path', 'data/tracks.csv')
  .option('-l, --limit <number>', 'Maximum tracks to export', '1000')
  .action(async (options) => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { dirname } = await import('node:path');

    try {
      console.log(`[Keeris Client] Fetching tracks via GraphQL...`);
      const data: any = await executeGql(options, GQL_UNIQUE_TRACKS, {
        limit: Number(options.limit) || 1000,
      });

      const tracks = data?.uniqueTracks || [];
      const csvValue = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const rows: string[][] = [];

      for (const t of tracks) {
        if (t.airings?.length) {
          for (const a of t.airings) {
            rows.push([a.date || '', a.episodeUrl || '', t.artist || '', t.title || '', a.programTitle || '']);
          }
        } else {
          rows.push(['', '', t.artist || '', t.title || '', '']);
        }
      }

      const csv = [['date', 'url', 'artist', 'title', 'program'], ...rows]
        .map((r) => r.map(csvValue).join(','))
        .join('\n') + '\n';

      mkdirSync(dirname(options.output), { recursive: true });
      writeFileSync(options.output, csv, 'utf8');
      console.log(JSON.stringify({ status: 'export_complete', output: options.output, records: rows.length }, null, 2));
    } catch (err: any) {
      console.error(`\x1b[31m[Keeris Error]\x1b[0m ${err.message}`);
      process.exitCode = 1;
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 7. Curator Host commands (seed, exec, run, chat, agent)
// Forwarded lazily to createHostCli without eager import overhead (matches Poker CLI)
// ─────────────────────────────────────────────────────────────────────────────
const hostCommands = ['seed', 'exec', 'run', 'chat', 'agent'];
for (const cmd of hostCommands) {
  program
    .command(cmd === 'exec' ? 'exec <toolName>' : cmd === 'run' ? 'run <agentName>' : cmd === 'chat' ? 'chat [agentName]' : cmd === 'agent' ? 'agent <agentName>' : cmd)
    .allowUnknownOption(true)
    .description(`Curator Host command: ${cmd}`)
    .action(async () => {
      console.log(`\x1b[36m[Keeris CLI] Loading CuratorHost for "${cmd}"...\x1b[0m`);
      const { createHostCli } = await import('@curator/host');
      const { createKeerisHost } = await import('./host.ts');
      const subProgram = createHostCli(createKeerisHost, { name: 'keeris' });
      await subProgram.parseAsync(process.argv);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Smart Argument Resolution:
// If a user provides only a search string argument (e.g. `keeris "Kauamängiv"`
// or `node src/cli.ts Kauamängiv`), automatically route to the search command.
// If run without arguments or with flags only, defaults to interactive client.
// ─────────────────────────────────────────────────────────────────────────────
const KNOWN_COMMANDS = new Set([
  'client', 'interactive', 'repl', 'play', 'i',
  'search', 'find', 's',
  'stats',
  'agents', 'status',
  'trigger',
  'export',
  'seed', 'exec', 'run', 'chat', 'agent',
  'help', '--help', '-h',
  '--version', '-v', '-V',
]);

const rawArgs = process.argv.slice(2);
const firstNonOptionIndex = rawArgs.findIndex((arg) => !arg.startsWith('-'));

let argvToParse = process.argv;
if (firstNonOptionIndex !== -1) {
  const firstNonOption = rawArgs[firstNonOptionIndex];
  if (!KNOWN_COMMANDS.has(firstNonOption)) {
    // Single search string passed without command name (e.g. `keeris "Kauamängiv"`)
    const newRawArgs = [...rawArgs];
    newRawArgs.splice(firstNonOptionIndex, 0, 'search');
    argvToParse = [process.argv[0], process.argv[1], ...newRawArgs];
  }
} else if (rawArgs.length > 0 && rawArgs.every((a) => a.startsWith('-') && !['--help', '-h', '--version', '-v', '-V'].includes(a))) {
  // Options only (e.g. `keeris --direct`) -> default to client command
  argvToParse = [process.argv[0], process.argv[1], 'client', ...rawArgs];
}

await program.parseAsync(argvToParse);
