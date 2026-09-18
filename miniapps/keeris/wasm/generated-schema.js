/**
 * Generated SQLite DDL compiled from prisma-sqlite/schema.prisma.
 * Defines both the Keeris domain archive schema and Curator AST workflow schema.
 */
export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  url TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY,
  program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
  url TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  scheduled_at TEXT,
  published_at TEXT,
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_hash TEXT,
  parse_status TEXT DEFAULT 'pending',
  parse_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_episodes_program_id ON episodes(program_id);
CREATE INDEX IF NOT EXISTS idx_episodes_scheduled_at ON episodes(scheduled_at);

CREATE TABLE IF NOT EXISTS unique_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT UNIQUE NOT NULL,
  artist TEXT,
  title TEXT,
  play_count INTEGER NOT NULL DEFAULT 1,
  first_played_at TEXT,
  last_played_at TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_unique_tracks_play_count ON unique_tracks(play_count);
CREATE INDEX IF NOT EXISTS idx_unique_tracks_artist ON unique_tracks(artist);

CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  unique_track_id INTEGER REFERENCES unique_tracks(id) ON DELETE SET NULL,
  position INTEGER NOT NULL,
  artist TEXT,
  title TEXT,
  raw_text TEXT NOT NULL,
  UNIQUE(episode_id, position)
);
CREATE INDEX IF NOT EXISTS idx_tracks_episode_id ON tracks(episode_id);
CREATE INDEX IF NOT EXISTS idx_tracks_unique_track_id ON tracks(unique_track_id);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);

CREATE TABLE IF NOT EXISTS episode_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER UNIQUE NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  description TEXT,
  full_text TEXT,
  summary TEXT,
  keywords TEXT
);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  unique_track_id INTEGER REFERENCES unique_tracks(id) ON DELETE SET NULL,
  track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_id ON playlist_items(playlist_id, position);

-- Curator AST Engine Models
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  ast TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  script_id TEXT REFERENCES scripts(id) ON DELETE SET NULL,
  schedule TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  script_id TEXT REFERENCES scripts(id),
  ast TEXT NOT NULL,
  context TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;
