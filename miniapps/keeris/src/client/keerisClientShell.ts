/**
 * Keeris Client Shell Specification & Configuration.
 * Declarative interactive asynchronous client shell for Keeris music & radio archive:
 * whitelisted tools, REPL commands, and background event rendering.
 */
import {
  createClientShell,
  type ClientShell,
  type CuratorChannel,
  type CuratorToolDefinition,
  type ReplCommand,
  type ShellContext,
  type ClientShellConfig,
} from '@curator/host/client';
import {
  keerisSearchTracksTool,
  keerisGetStatsTool,
  keerisGetAgentsTool,
  keerisTriggerAgentTool,
  keerisDownloadEpisodeTool,
} from '../plugins/keerisTools.ts';
import { KeerisEvent } from '../models/index.ts';

const asShellTool = (tool: any, aliases: string[] = []): CuratorToolDefinition => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters,
  aliases,
});

export const KEERIS_WHITELISTED_TOOLS: (string | CuratorToolDefinition)[] = [
  asShellTool(keerisSearchTracksTool, ['search', 'find']),
  asShellTool(keerisGetStatsTool, ['stats']),
  asShellTool(keerisGetAgentsTool, ['agents']),
  asShellTool(keerisTriggerAgentTool, ['trigger']),
  asShellTool(keerisDownloadEpisodeTool, ['download']),
];

/**
 * REPL inspection and action commands.
 */
export const KEERIS_COMMANDS: ReplCommand[] = [
  {
    name: 'search',
    usage: '<query...>',
    aliases: ['find', 's'],
    description: 'Search tracks by artist or title (tool: keeris_search_tracks)',
    execute: async (_rawArgs, tokens, ctx: ShellContext) => {
      const query = (tokens.join(' ') || _rawArgs || '').trim();
      if (!query) {
        console.log('\x1b[33mUsage: search <artist or title>\x1b[0m');
        return;
      }
      try {
        const channel: any = ctx.channel;
        let res: any;
        if (typeof channel?.runTool === 'function') {
          res = await channel.runTool('keeris_search_tracks', { search: query, limit: 15 });
        } else if (channel) {
          res = await channel.send('curator:tool_call', {
            tool: 'keeris_search_tracks',
            args: { search: query, limit: 15 },
          });
        }
        const tracks = res?.result?.uniqueTracks || res?.uniqueTracks || [];
        if (!tracks.length) {
          console.log(`\x1b[33mNo tracks found matching "${query}".\x1b[0m`);
          return;
        }

        console.log(`\n\x1b[1m\x1b[36m=== Tracks Matching "${query}" (${tracks.length}) ===\x1b[0m\n`);
        const idW = 8, artistW = 28, titleW = 32, playsW = 7;
        console.log(
          'ID'.padEnd(idW) +
          'Artist'.padEnd(artistW) +
          'Title'.padEnd(titleW) +
          'Plays'.padStart(playsW)
        );
        console.log('─'.repeat(idW + artistW + titleW + playsW));

        for (const t of tracks) {
          const id = String(t.id).padEnd(idW);
          const artist = (t.artist || 'Unknown').slice(0, artistW - 2).padEnd(artistW);
          const title = (t.title || 'Untitled').slice(0, titleW - 2).padEnd(titleW);
          const plays = String(t.playCount || 0).padStart(playsW);
          console.log(
            `\x1b[90m${id}\x1b[0m` +
            `\x1b[36m${artist}\x1b[0m` +
            `\x1b[37m${title}\x1b[0m` +
            `\x1b[32m${plays}\x1b[0m`
          );
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
    execute: async (_rawArgs, _tokens, ctx: ShellContext) => {
      try {
        const channel: any = ctx.channel;
        let res: any;
        if (typeof channel?.runTool === 'function') {
          res = await channel.runTool('keeris_get_stats', {});
        } else if (channel) {
          res = await channel.send('curator:tool_call', { tool: 'keeris_get_stats', args: {} });
        }
        const s = res?.result?.stats || res?.stats;
        if (!s) {
          console.log('\x1b[33mNo stats available.\x1b[0m');
          return;
        }
        console.log('\n\x1b[1m\x1b[36m=== Keeris Catalog Statistics ===\x1b[0m');
        console.log(`Episodes:       \x1b[32m${s.episodes ?? 0}\x1b[0m`);
        console.log(`Total Plays:    \x1b[32m${s.tracks ?? 0}\x1b[0m`);
        console.log(`Unique Songs:   \x1b[32m${s.uniqueTracks ?? 0}\x1b[0m`);
        console.log(`Programs:       \x1b[32m${s.programs ?? 0}\x1b[0m\n`);
      } catch (err: any) {
        console.error(`\x1b[31mStats failed: ${err.message}\x1b[0m`);
      }
    },
  },
  {
    name: 'agents',
    description: 'Inspect registered crawler agents (tool: keeris_get_agents)',
    execute: async (_rawArgs, _tokens, ctx: ShellContext) => {
      try {
        const channel: any = ctx.channel;
        let res: any;
        if (typeof channel?.runTool === 'function') {
          res = await channel.runTool('keeris_get_agents', {});
        } else if (channel) {
          res = await channel.send('curator:tool_call', { tool: 'keeris_get_agents', args: {} });
        }
        const agents = res?.result?.curatorAgents || res?.curatorAgents || [];
        console.log(`\n\x1b[1m\x1b[36m=== Curator Crawler Agents (${agents.length}) ===\x1b[0m\n`);
        for (const a of agents) {
          const status = a.isActive ? '\x1b[32mRUNNING\x1b[0m' : a.enabled ? '\x1b[36mENABLED\x1b[0m' : '\x1b[90mDISABLED\x1b[0m';
          console.log(`  • \x1b[1m${a.name}\x1b[0m [${status}] (${a.episodesCount ?? 0} eps, ${a.tracksCount ?? 0} tracks)`);
        }
        console.log('');
      } catch (err: any) {
        console.error(`\x1b[31mAgents failed: ${err.message}\x1b[0m`);
      }
    },
  },
  {
    name: 'trigger',
    usage: '<agentName> [refresh]',
    description: 'Trigger crawler agent workflow (tool: keeris_trigger_agent)',
    execute: async (_rawArgs, tokens, ctx: ShellContext) => {
      const name = tokens[0];
      const refresh = tokens[1] === 'refresh' || tokens[1] === 'true';
      if (!name) {
        console.log('\x1b[33mUsage: trigger <agentName> [refresh]\x1b[0m');
        return;
      }
      try {
        console.log(`\x1b[36mTriggering agent "${name}" (refresh=${refresh})...\x1b[0m`);
        const channel: any = ctx.channel;
        let res: any;
        if (typeof channel?.runTool === 'function') {
          res = await channel.runTool('keeris_trigger_agent', { name, refresh });
        } else if (channel) {
          res = await channel.send('curator:tool_call', {
            tool: 'keeris_trigger_agent',
            args: { name, refresh },
          });
        }
        console.log('\x1b[32m✔ Agent triggered successfully:\x1b[0m', res?.result || res);
      } catch (err: any) {
        console.error(`\x1b[31mTrigger failed: ${err.message}\x1b[0m`);
      }
    },
  },
  {
    name: 'download',
    usage: '<episodeUrl> [outputDir]',
    description: 'Download audio file for episode (tool: vikerraadio_download_episode)',
    execute: async (_rawArgs, tokens, ctx: ShellContext) => {
      const url = tokens[0];
      const outputDir = tokens[1];
      if (!url) {
        console.log('\x1b[33mUsage: download <episodeUrl> [outputDir]\x1b[0m');
        return;
      }
      try {
        console.log(`\x1b[36mDownloading episode audio from ${url}...\x1b[0m`);
        const channel: any = ctx.channel;
        let res: any;
        if (typeof channel?.runTool === 'function') {
          res = await channel.runTool('vikerraadio_download_episode', { url, outputDir });
        } else if (channel) {
          res = await channel.send('curator:tool_call', {
            tool: 'vikerraadio_download_episode',
            args: { url, outputDir },
          });
        }
        console.log('\x1b[32m✔ Download result:\x1b[0m', res?.result || res);
      } catch (err: any) {
        console.error(`\x1b[31mDownload failed: ${err.message}\x1b[0m`);
      }
    },
  },
  {
    name: 'status',
    description: 'Display current connection & runtime status',
    execute: (_rawArgs, _tokens, ctx: ShellContext) => {
      const isDirect = Boolean((ctx.channel as any)?.host);
      console.log(`\n\x1b[1m\x1b[36m=== Keeris Client Status ===\x1b[0m`);
      console.log(`Mode:    \x1b[33m${isDirect ? 'Direct In-Process (SQLite/MariaDB)' : 'Remote WebSocket'}\x1b[0m`);
      console.log(`Channel: \x1b[32mConnected\x1b[0m\n`);
    },
  },
];

export interface CreateKeerisClientShellOptions {
  channel?: CuratorChannel;
  actorName?: string;
  getState?: () => any;
  extraCommands?: ReplCommand[];
}

/**
 * Creates a configured ClientShell for Keeris.
 */
export function createKeerisClientShell(
  opts: CreateKeerisClientShellOptions = {}
): ClientShell {
  return createClientShell({
    actorName: opts.actorName || 'Curator',
    channel: opts.channel,
    commands: [...KEERIS_COMMANDS, ...(opts.extraCommands ?? [])],
    tools: KEERIS_WHITELISTED_TOOLS,
    getState: opts.getState,
    onToolCall: async (toolName: string, args: Record<string, any>, ctx?: ShellContext) => {
      const allowed = ctx?.tools || KEERIS_WHITELISTED_TOOLS;
      const matched = allowed.find(
        (t) => (typeof t === 'string' ? t : t.name) === toolName
      );
      if (!matched) {
        console.log(`\x1b[31m[Security] Tool "${toolName}" is not whitelisted.\x1b[0m`);
        return;
      }
      const channel: any = ctx?.channel;
      if (typeof channel?.runTool === 'function') {
        const { result, status, requestId } = await channel.runTool(toolName, args);
        if (status === 'WAITING_FOR_USER') {
          console.log(`\x1b[33m⏸ [Tool "${toolName}"] awaiting approval (request #${requestId})\x1b[0m`);
          return;
        }
        console.log(`\x1b[32m✔ [Tool "${toolName}" Result]:\x1b[0m`, JSON.stringify(result, null, 2));
        return result;
      }
      if (channel) {
        return channel.send('curator:tool_call', { tool: toolName, args });
      }
    },
    onSpeech: async (text: string) => {
      console.log(`\x1b[90m[Keeris Shell]\x1b[0m Type a command (e.g. search, stats, agents, trigger) or "help". ("${text}")`);
    },
  });
}

/**
 * Formats incoming background events above the active shell prompt without corrupting user input.
 */
export function renderKeerisEvent(event: any): void {
  const { type, payload } = event || {};
  if (type === KeerisEvent.SCRAPE_PROGRESS) {
    console.log(`\x1b[36m[Crawler Progress]\x1b[0m ${payload?.programTitle || 'Program'}: ${payload?.current || 0}/${payload?.total || 0} episodes`);
  } else if (type === KeerisEvent.EPISODE_SAVED) {
    console.log(`\x1b[32m[Episode Indexed]\x1b[0m ${payload?.title || 'Episode'} (${payload?.tracksCount || 0} tracks)`);
  } else if (type === KeerisEvent.TRACK_SAVED) {
    console.log(`\x1b[90m[Track]\x1b[0m ${payload?.artist || 'Unknown'} - ${payload?.title || 'Untitled'}`);
  }
}

