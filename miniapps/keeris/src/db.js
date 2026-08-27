import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(filename) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      scheduled_at TEXT, published_at TEXT, fetched_at TEXT NOT NULL,
      raw_hash TEXT, parse_status TEXT NOT NULL DEFAULT 'pending', parse_error TEXT
    );
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY, episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, artist TEXT, title TEXT, raw_text TEXT NOT NULL,
      UNIQUE (episode_id, position)
    );
    CREATE INDEX IF NOT EXISTS tracks_artist_idx ON tracks (artist);
    CREATE INDEX IF NOT EXISTS episodes_scheduled_at_idx ON episodes (scheduled_at);
    CREATE TABLE IF NOT EXISTS scrape_runs (
      id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT,
      archive_pages INTEGER NOT NULL DEFAULT 0, episodes_seen INTEGER NOT NULL DEFAULT 0,
      episodes_parsed INTEGER NOT NULL DEFAULT 0, tracks_saved INTEGER NOT NULL DEFAULT 0,
      failures INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

export function saveEpisode(db, episode, tracks, { rawHash = null, status = 'parsed', error = null } = {}) {
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO episodes (id, url, title, scheduled_at, published_at, fetched_at, raw_hash, parse_status, parse_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET url=excluded.url, title=excluded.title, scheduled_at=excluded.scheduled_at,
      published_at=excluded.published_at, fetched_at=excluded.fetched_at, raw_hash=excluded.raw_hash,
      parse_status=excluded.parse_status, parse_error=excluded.parse_error`).run(
      episode.id, episode.url, episode.heading ?? 'Kauamängiv', episode.scheduledAt ?? null,
      episode.publishedAt ?? null, now, rawHash, status, error
    );
    db.prepare('DELETE FROM tracks WHERE episode_id = ?').run(episode.id);
    const insert = db.prepare('INSERT INTO tracks (episode_id, position, artist, title, raw_text) VALUES (?, ?, ?, ?, ?)');
    for (const track of tracks) insert.run(episode.id, track.position, track.artist, track.title, track.rawText);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}