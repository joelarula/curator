/**
 * Shared GraphQL response types for the Keeris app.
 * Derived from the SDL defined in src/graphql-typedefs.ts.
 * Import these in Vue components instead of declaring local interfaces.
 */

export interface Program {
  id: string;
  seriesId: string;
  title: string;
  slug: string | null;
  description: string | null;
  url: string | null;
}

export interface EpisodeMetadata {
  id: string;
  description: string | null;
  fullText: string | null;
  summary: string | null;
  keywords: string | null;
}

export interface Episode {
  id: string;
  url: string;
  title: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  parseStatus: string;
  trackCount: number;
  program: Program | null;
  metadata: EpisodeMetadata | null;
}

export interface UniqueTrack {
  id: string;
  fingerprint: string;
  artist: string | null;
  title: string | null;
  playCount: number;
  firstPlayedAt: string | null;
  lastPlayedAt: string | null;
  airings?: Track[];
}

export interface Track {
  id: string;
  position: number;
  artist: string | null;
  title: string | null;
  rawText: string;
  date: string | null;
  episodeTitle: string;
  episodeUrl: string;
  programTitle: string | null;
  episodeDescription: string | null;
  uniqueTrack?: UniqueTrack;
}

export interface ProgramStat {
  programId: string;
  programTitle: string;
  episodes: number;
  tracks: number;
  uniqueTracks: number;
}

export interface Stats {
  episodes: number;
  tracks: number;
  uniqueTracks: number;
  programs: number;
  programBreakdown: ProgramStat[] | null;
}

export interface CuratorAgent {
  id: string;
  name: string;
  schedule: string | null;
  isActive: boolean | null;
  episodesCount?: number | null;
  tracksCount?: number | null;
  lastRunAt?: string | null;
}

export interface CuratorResponse {
  id: string;
  requestId: string;
  content: string | null;
  createdAt: string | null;
}

export interface CuratorRequest {
  id: string;
  scriptId?: string | null;
  ast?: string | null;
  status: string | null;
  createdAt: string | null;
  responses: CuratorResponse[];
}

export interface PlaylistItem {
  id: string;
  playlistId: string;
  position: number;
  notes: string | null;
  createdAt: string | null;
  uniqueTrack?: UniqueTrack;
  track?: Track;
  episode?: Episode;
}

export interface Playlist {
  id: string;
  title: string;
  description: string | null;
  createdAt: string | null;
  itemCount: number;
  items: PlaylistItem[];
}

export interface CuratorTableInfo {
  name: string;
  rowCount: number;
}

export interface CuratorDatabaseHealth {
  storageEngine: string | null;
  isOpfs: boolean | null;
  tables: CuratorTableInfo[];
  requestsTotal: number | null;
  requestsCompleted: number | null;
  requestsFailed: number | null;
  requestsPending: number | null;
  agentsTotal: number | null;
  agentsActive: number | null;
}

/** UI-only type: not part of the GraphQL schema */
export interface EpisodeProgress {
  index: number;
  total: number;
  episodeTitle: string;
  tracksCount: number;
  [key: string]: unknown;
}

/** UI-only type: not part of the GraphQL schema */
export interface ScraperLogEntry {
  type: string;
  text: string;
}
