/**
 * Keeris Domain Contracts: Roles, Tools, Events, Modules, and Constants.
 * Canonical single source of truth for all Keeris identifiers and enums.
 */

// ==========================================
// 1. Domain Security Roles (RBAC)
// ==========================================
export const KeerisRole = {
  ADMIN: 'keeris:admin',
  CURATOR: 'keeris:curator',
  VIEWER: 'keeris:viewer',
} as const;

export type KeerisRole = (typeof KeerisRole)[keyof typeof KeerisRole];

// ==========================================
// 2. Tool Identifiers & Usage
// ==========================================
export const KeerisTool = {
  SEARCH_TRACKS: 'keeris_search_tracks',
  GET_STATS: 'keeris_get_stats',
  GET_AGENTS: 'keeris_get_agents',
  TRIGGER_AGENT: 'keeris_trigger_agent',
  DOWNLOAD_EPISODE: 'vikerraadio_download_episode',
  // Archive discovery and crawler pipeline tools
  DISCOVER_EPISODES: 'vikerraadio_discover_episodes',
  PROCESS_EPISODE: 'vikerraadio_process_episode',
  SCRAPE_SERIES: 'vikerraadio_scrape',
  DISCOVER_MISSING: 'vikerraadio_discover_missing_episodes',
} as const;

export type KeerisTool = (typeof KeerisTool)[keyof typeof KeerisTool];

// ==========================================
// 3. Domain Events
// ==========================================
export const KeerisEvent = {
  SCRAPE_PROGRESS: 'err:scrape_progress',
  EPISODE_SAVED: 'err:episode_saved',
  TRACK_SAVED: 'err:track_saved',
} as const;

export type KeerisEvent = (typeof KeerisEvent)[keyof typeof KeerisEvent];

// ==========================================
// 4. Workflow Modules
// ==========================================
export const KeerisModule = {
  PIPELINE_SCRAPE: 'pipeline_scrape',
  PIPELINE_RESCRAPE: 'pipeline_rescrape_missing',
  SINGLE_SCRAPE: 'single_scrape',
} as const;

export type KeerisModule = (typeof KeerisModule)[keyof typeof KeerisModule];

// ==========================================
// 5. Constants & Defaults
// ==========================================
export const KeerisConstant = {
  APP_ID: 'keeris',
  DEFAULT_DB_PATH: 'data/keeris.db',
  DEFAULT_SERVER_URL: 'http://localhost:4001',
  DEFAULT_WS_PATH: '/api/events',
  ENV_SERVER_URL: 'VITE_SERVER_URL',
  DEFAULT_ACTOR_NAME: 'Curator',
} as const;

