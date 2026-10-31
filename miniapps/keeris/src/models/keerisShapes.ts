/**
 * Keeris Domain Data Shapes & Tool Contracts.
 */

export interface AiringRecord {
  date?: string | null;
  programTitle?: string | null;
  episodeTitle?: string | null;
  episodeUrl?: string | null;
}

export interface TrackRecord {
  id: string | number;
  artist?: string | null;
  title?: string | null;
  playCount?: number;
  firstPlayedAt?: string | null;
  lastPlayedAt?: string | null;
  airings?: AiringRecord[];
}

export interface ProgramBreakdownRecord {
  programId: string | number;
  programTitle: string;
  episodes: number;
  tracks: number;
  uniqueTracks: number;
}

export interface CatalogStatsRecord {
  episodes: number;
  tracks: number;
  uniqueTracks: number;
  programs: number;
  programBreakdown?: ProgramBreakdownRecord[];
}

export interface CuratorAgentOverview {
  id: string;
  name: string;
  schedule?: string;
  enabled?: boolean;
  isActive?: boolean;
  episodesCount?: number;
  tracksCount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Input & Output Contracts
// ─────────────────────────────────────────────────────────────────────────────

export interface TrackSearchInput {
  search?: string;
  query?: string;
  term?: string;
  limit?: number;
  programIds?: string[];
}

export interface TrackSearchOutput {
  uniqueTracks: TrackRecord[];
}

export interface CatalogStatsInput {
  search?: string;
  programIds?: string[];
}

export interface CatalogStatsOutput {
  stats: CatalogStatsRecord;
}

export interface AgentsOverviewInput {
  filter?: string;
}

export interface AgentsOverviewOutput {
  curatorAgents: CuratorAgentOverview[];
}

export interface TriggerAgentInput {
  name: string;
  refresh?: boolean;
  context?: Record<string, unknown>;
}

export interface TriggerAgentOutput {
  triggerCuratorAgent: {
    id: string;
    content?: string;
    createdAt?: string;
  };
}

export interface DownloadEpisodeInput {
  url: string;
  outputDir?: string;
}

export interface DownloadEpisodeOutput {
  audioUrl?: string;
  destinationPath?: string;
  success: boolean;
}

