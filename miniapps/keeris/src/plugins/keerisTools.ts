import type { CuratorToolDefinition } from '@curator/host';
import {
  GQL_UNIQUE_TRACKS,
  GQL_STATS,
  GQL_AGENTS_OVERVIEW,
  GQL_TRIGGER_AGENT,
} from '../client/keerisClient.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Pure Tool Query Executor: executes purely against domain database (domainDb).
// Zero awareness or leakage of transport, network adapters, CLI modes, or channels.
// ─────────────────────────────────────────────────────────────────────────────
export async function executeToolQuery<T = any>(ctx: any, query: string, variables: any = {}): Promise<T> {
  const db = ctx?.domainDb || ctx?.db || (typeof ctx?.getState === 'function' ? ctx.getState()?.domainDb : null);
  if (!db) {
    throw new Error('Tool execution requires a domain database (domainDb) in tool context.');
  }

  const { executeGraphql } = await import('../server/graphql.ts');
  const res = await executeGraphql(db, query, variables, {
    user: { id: 'system', email: 'system@local', roles: ['curator_manager', 'admin'] },
  });
  if (res.errors?.length) {
    throw new Error(res.errors.map((e: any) => e.message).join(', '));
  }
  return res.data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tool: keeris_search_tracks
// ─────────────────────────────────────────────────────────────────────────────
export const keerisSearchTracksTool: CuratorToolDefinition = {
  name: 'keeris_search_tracks',
  description: 'Search unique tracks, song recordings, and broadcast airings in the Keeris catalog by artist or title.',
  usage: '<query> [limit]',
  aliases: ['search_tracks', 'find_tracks'],
  parameters: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Search term for artist name or track title' },
      limit: { type: 'number', description: 'Maximum tracks to return (default: 15)' },
      programIds: { type: 'array', items: { type: 'string' }, description: 'Optional program ID filters' },
    },
    required: ['search'],
  },
  execute: async (args: any, ctx: any) => {
    const search = args?.search || args?.query || args?.term || (typeof args === 'string' ? args : '');
    const limit = Number(args?.limit) || 15;
    const programIds = args?.programIds;
    return await executeToolQuery(ctx, GQL_UNIQUE_TRACKS, { search, limit, programIds });
  },
  runAsync: async ({ args, toolContext }: any) => {
    return await keerisSearchTracksTool.execute!(args, toolContext);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tool: keeris_get_stats
// ─────────────────────────────────────────────────────────────────────────────
export const keerisGetStatsTool: CuratorToolDefinition = {
  name: 'keeris_get_stats',
  description: 'Retrieve comprehensive archive statistics for the Keeris radio catalog (episodes, tracks, unique songs, programs, and program breakdown).',
  usage: '[search]',
  aliases: ['stats', 'get_stats', 'catalog_stats'],
  parameters: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Optional search filter for stats breakdown' },
      programIds: { type: 'array', items: { type: 'string' }, description: 'Optional program ID filters' },
    },
  },
  execute: async (args: any, ctx: any) => {
    return await executeToolQuery(ctx, GQL_STATS, args || {});
  },
  runAsync: async ({ args, toolContext }: any) => {
    return await keerisGetStatsTool.execute!(args, toolContext);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tool: keeris_get_agents
// ─────────────────────────────────────────────────────────────────────────────
export const keerisGetAgentsTool: CuratorToolDefinition = {
  name: 'keeris_get_agents',
  description: 'Inspect registered Curator crawler agents, schedules, episode/track counts, and engine processor status.',
  usage: '',
  aliases: ['agents', 'get_agents', 'agents_overview'],
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args: any, ctx: any) => {
    return await executeToolQuery(ctx, GQL_AGENTS_OVERVIEW, {});
  },
  runAsync: async ({ args, toolContext }: any) => {
    return await keerisGetAgentsTool.execute!(args, toolContext);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tool: keeris_trigger_agent
// ─────────────────────────────────────────────────────────────────────────────
export const keerisTriggerAgentTool: CuratorToolDefinition = {
  name: 'keeris_trigger_agent',
  description: 'Trigger a Curator crawler agent workflow to index episodes and music tracks into the archive.',
  usage: '<agentName> [refresh]',
  aliases: ['trigger_agent', 'run_crawler'],
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the crawler agent (e.g. vikerraadio_kauamangiv_scrape)' },
      refresh: { type: 'boolean', description: 'Whether to re-scrape already indexed episodes' },
    },
    required: ['name'],
  },
  execute: async (args: any, ctx: any) => {
    const name = args?.name || args?.agentName || (typeof args === 'string' ? args : '');
    const refresh = Boolean(args?.refresh);
    if (!name) throw new Error('Agent name is required');
    return await executeToolQuery(ctx, GQL_TRIGGER_AGENT, { name, refresh });
  },
  runAsync: async ({ args, toolContext }: any) => {
    return await keerisTriggerAgentTool.execute!(args, toolContext);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Tool: vikerraadio_download_episode
// ─────────────────────────────────────────────────────────────────────────────
export const keerisDownloadEpisodeTool: CuratorToolDefinition = {
  name: 'vikerraadio_download_episode',
  description: 'Download the high-quality audio file (.m4a / .mp3) for any Vikerraadio/ERR radio episode directly to disk.',
  usage: '<url> [outputDir] [fileName]',
  aliases: ['download_episode', 'download_audio', 'get_episode_audio'],
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Vikerraadio episode webpage URL or ID' },
      outputDir: { type: 'string', description: 'Local destination directory (default: data/downloads)' },
      fileName: { type: 'string', description: 'Custom destination filename' },
    },
    required: ['url'],
  },
  execute: async (args: any, _ctx: any) => {
    const { createErrRadioPlugin } = await import('./err-radio.ts');
    const rawTool = createErrRadioPlugin(null).tools.vikerraadio_download_episode;
    return await rawTool.runAsync({ args });
  },
  runAsync: async ({ args, toolContext }: any) => {
    return await keerisDownloadEpisodeTool.execute!(args, toolContext);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Tool: vikerraadio_discover_episodes
// ─────────────────────────────────────────────────────────────────────────────
export const keerisDiscoverEpisodesTool: CuratorToolDefinition = {
  name: 'vikerraadio_discover_episodes',
  description: 'Discover available episodes from Vikerraadio/ERR archive API for any series content ID.',
  usage: '[seriesContentId] [limit]',
  aliases: ['discover_episodes', 'list_archive_episodes'],
  parameters: {
    type: 'object',
    properties: {
      seriesContentId: { type: 'string', description: 'Series content ID (default: 1037846 for Kauamängiv)' },
      limit: { type: 'number', description: 'Number of episodes to fetch (default: 50)' },
      onlyNew: { type: 'boolean', description: 'Filter out already parsed episodes' },
    },
  },
  execute: async (args: any, ctx: any) => {
    const { createErrRadioPlugin } = await import('./err-radio.ts');
    const db = ctx?.domainDb || (ctx?.getState?.() as any)?.domainDb;
    const rawTool = createErrRadioPlugin(db).tools.vikerraadio_discover_episodes;
    return await rawTool.runAsync({ args });
  },
  runAsync: async ({ args, toolContext }: any) => {
    return await keerisDiscoverEpisodesTool.execute!(args, toolContext);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. Tool: vikerraadio_process_episode
// ─────────────────────────────────────────────────────────────────────────────
export const keerisProcessEpisodeTool: CuratorToolDefinition = {
  name: 'vikerraadio_process_episode',
  description: 'Fetch, parse music tracks, and persist a single radio episode into the database in one fault-isolated step.',
  usage: '<url> [refresh]',
  aliases: ['process_episode', 'scrape_episode'],
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Episode webpage URL' },
      refresh: { type: 'boolean', description: 'Force re-scraping even if tracks exist' },
    },
    required: ['url'],
  },
  execute: async (args: any, ctx: any) => {
    const { createErrRadioPlugin } = await import('./err-radio.ts');
    const db = ctx?.domainDb || (ctx?.getState?.() as any)?.domainDb;
    const rawTool = createErrRadioPlugin(db).tools.vikerraadio_process_episode;
    return await rawTool.runAsync({ args });
  },
  runAsync: async ({ args, toolContext }: any) => {
    return await keerisProcessEpisodeTool.execute!(args, toolContext);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Master Whitelist of Permitted Curator Tools in Keeris Shell (matches Poker)
// ─────────────────────────────────────────────────────────────────────────────
export const KEERIS_WHITELISTED_TOOLS: CuratorToolDefinition[] = [
  keerisSearchTracksTool,
  keerisGetStatsTool,
  keerisGetAgentsTool,
  keerisTriggerAgentTool,
  keerisDownloadEpisodeTool,
  keerisDiscoverEpisodesTool,
  keerisProcessEpisodeTool,
];

