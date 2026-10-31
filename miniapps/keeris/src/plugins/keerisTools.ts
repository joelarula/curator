import { defineTool, type CuratorTool, type CuratorToolContext } from '@curator/agent-server';
import type { CuratorToolDefinition } from '@curator/host';
import {
  KeerisRole,
  KeerisTool,
  GQL_UNIQUE_TRACKS,
  GQL_STATS,
  GQL_AGENTS_OVERVIEW,
  GQL_TRIGGER_AGENT,
  type TrackSearchInput,
  type CatalogStatsInput,
  type TriggerAgentInput,
  type DownloadEpisodeInput,
} from '../models/index.ts';

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
export const keerisSearchTracksTool: CuratorTool & CuratorToolDefinition = defineTool({
  name: KeerisTool.SEARCH_TRACKS,
  description: 'Search unique tracks, song recordings, and broadcast airings in the Keeris catalog by artist or title.',
  usage: '<query> [limit]',
  aliases: ['search_tracks', 'find_tracks', 'search'],
  requiredRole: KeerisRole.VIEWER,
  accessLevel: 'safe_read',
  parameters: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Search term for artist name or track title' },
      limit: { type: 'number', description: 'Maximum tracks to return (default: 15)' },
      programIds: { type: 'array', items: { type: 'string' }, description: 'Optional program ID filters' },
    },
    required: ['search'],
  },
  execute: async (args: TrackSearchInput, ctx: any) => {
    const search = args?.search || (args as any)?.query || (args as any)?.term || (typeof args === 'string' ? args : '');
    const limit = Number(args?.limit) || 15;
    const programIds = args?.programIds;
    return await executeToolQuery(ctx, GQL_UNIQUE_TRACKS, { search, limit, programIds });
  },
}) as CuratorTool & CuratorToolDefinition;

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tool: keeris_get_stats
// ─────────────────────────────────────────────────────────────────────────────
export const keerisGetStatsTool: CuratorTool & CuratorToolDefinition = defineTool({
  name: KeerisTool.GET_STATS,
  description: 'Retrieve comprehensive archive statistics for the Keeris radio catalog (episodes, tracks, unique songs, programs, and program breakdown).',
  usage: '[search]',
  aliases: ['stats', 'get_stats', 'catalog_stats'],
  requiredRole: KeerisRole.VIEWER,
  accessLevel: 'safe_read',
  parameters: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Optional search filter for stats breakdown' },
      programIds: { type: 'array', items: { type: 'string' }, description: 'Optional program ID filters' },
    },
  },
  execute: async (args: CatalogStatsInput, ctx: any) => {
    return await executeToolQuery(ctx, GQL_STATS, args || {});
  },
}) as CuratorTool & CuratorToolDefinition;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tool: keeris_get_agents
// ─────────────────────────────────────────────────────────────────────────────
export const keerisGetAgentsTool: CuratorTool & CuratorToolDefinition = defineTool({
  name: KeerisTool.GET_AGENTS,
  description: 'Inspect registered Curator crawler agents, schedules, episode/track counts, and engine processor status.',
  usage: '',
  aliases: ['agents', 'get_agents', 'agents_overview'],
  requiredRole: KeerisRole.VIEWER,
  accessLevel: 'safe_read',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args: any, ctx: any) => {
    return await executeToolQuery(ctx, GQL_AGENTS_OVERVIEW, {});
  },
}) as CuratorTool & CuratorToolDefinition;

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tool: keeris_trigger_agent
// ─────────────────────────────────────────────────────────────────────────────
export const keerisTriggerAgentTool: CuratorTool & CuratorToolDefinition = defineTool({
  name: KeerisTool.TRIGGER_AGENT,
  description: 'Trigger a Curator crawler agent workflow to index episodes and music tracks into the archive.',
  usage: '<agentName> [refresh]',
  aliases: ['trigger_agent', 'run_crawler'],
  requiredRole: KeerisRole.CURATOR,
  accessLevel: 'safe_write',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the crawler agent (e.g. vikerraadio_kauamangiv_scrape)' },
      refresh: { type: 'boolean', description: 'Whether to re-scrape already indexed episodes' },
    },
    required: ['name'],
  },
  execute: async (args: TriggerAgentInput, ctx: any) => {
    const name = args?.name || (typeof args === 'string' ? args : '');
    const refresh = Boolean(args?.refresh);
    if (!name) throw new Error('Agent name is required');
    return await executeToolQuery(ctx, GQL_TRIGGER_AGENT, { name, refresh });
  },
}) as CuratorTool & CuratorToolDefinition;

// ─────────────────────────────────────────────────────────────────────────────
// 5. Tool: vikerraadio_download_episode
// ─────────────────────────────────────────────────────────────────────────────
export const keerisDownloadEpisodeTool: CuratorTool & CuratorToolDefinition = defineTool({
  name: KeerisTool.DOWNLOAD_EPISODE,
  description: 'Download the high-quality audio file (.m4a / .mp3) for any Vikerraadio/ERR radio episode directly to disk.',
  usage: '<url> [outputDir] [fileName]',
  aliases: ['download_episode', 'download_audio', 'get_episode_audio'],
  requiredRole: KeerisRole.CURATOR,
  accessLevel: 'safe_write',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Vikerraadio episode webpage URL or ID' },
      outputDir: { type: 'string', description: 'Local destination directory (default: data/downloads)' },
      fileName: { type: 'string', description: 'Custom destination filename' },
    },
    required: ['url'],
  },
  execute: async (args: DownloadEpisodeInput, _ctx: any) => {
    const { createErrRadioPlugin } = await import('./err-radio.ts');
    const rawTool = createErrRadioPlugin(null).tools.vikerraadio_download_episode;
    return await rawTool.runAsync({ args });
  },
}) as CuratorTool & CuratorToolDefinition;

// ─────────────────────────────────────────────────────────────────────────────
// 6. Tool: vikerraadio_discover_episodes
// ─────────────────────────────────────────────────────────────────────────────
export const keerisDiscoverEpisodesTool: CuratorTool & CuratorToolDefinition = defineTool({
  name: KeerisTool.DISCOVER_EPISODES,
  description: 'Discover available episodes from Vikerraadio/ERR archive API for any series content ID.',
  usage: '[seriesContentId] [limit]',
  aliases: ['discover_episodes', 'list_archive_episodes'],
  requiredRole: KeerisRole.CURATOR,
  accessLevel: 'safe_read',
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
}) as CuratorTool & CuratorToolDefinition;

// ─────────────────────────────────────────────────────────────────────────────
// 7. Tool: vikerraadio_process_episode
// ─────────────────────────────────────────────────────────────────────────────
export const keerisProcessEpisodeTool: CuratorTool & CuratorToolDefinition = defineTool({
  name: KeerisTool.PROCESS_EPISODE,
  description: 'Fetch, parse music tracks, and persist a single radio episode into the database in one fault-isolated step.',
  usage: '<url> [refresh]',
  aliases: ['process_episode', 'scrape_episode'],
  requiredRole: KeerisRole.CURATOR,
  accessLevel: 'safe_write',
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
}) as CuratorTool & CuratorToolDefinition;

// ─────────────────────────────────────────────────────────────────────────────
// Master Whitelist of Permitted Curator Tools in Keeris Shell (matches Poker)
// ─────────────────────────────────────────────────────────────────────────────
export const KEERIS_WHITELISTED_TOOLS: (CuratorTool & CuratorToolDefinition)[] = [
  keerisSearchTracksTool,
  keerisGetStatsTool,
  keerisGetAgentsTool,
  keerisTriggerAgentTool,
  keerisDownloadEpisodeTool,
  keerisDiscoverEpisodesTool,
  keerisProcessEpisodeTool,
];
