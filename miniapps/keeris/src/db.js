import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(filename) {
  mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      slug TEXT UNIQUE,
      description TEXT,
      url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY,
      program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      scheduled_at TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      raw_hash TEXT,
      parse_status TEXT NOT NULL DEFAULT 'pending',
      parse_error TEXT
    );

    CREATE TABLE IF NOT EXISTS unique_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      artist TEXT,
      title TEXT,
      play_count INTEGER NOT NULL DEFAULT 1,
      first_played_at TEXT,
      last_played_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      unique_track_id INTEGER REFERENCES unique_tracks(id) ON DELETE SET NULL,
      position INTEGER NOT NULL,
      artist TEXT,
      title TEXT,
      raw_text TEXT NOT NULL,
      UNIQUE (episode_id, position)
    );

    CREATE TABLE IF NOT EXISTS episode_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER NOT NULL UNIQUE REFERENCES episodes(id) ON DELETE CASCADE,
      description TEXT,
      full_text TEXT,
      summary TEXT,
      keywords TEXT
    );
  `);

  // Column migration checks for existing databases
  try {
    const epCols = db.prepare("PRAGMA table_info('episodes')").all();
    if (!epCols.some((col) => col.name === 'program_id')) {
      db.exec('ALTER TABLE episodes ADD COLUMN program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL');
    }
  } catch (_) {}

  try {
    const trCols = db.prepare("PRAGMA table_info('tracks')").all();
    if (!trCols.some((col) => col.name === 'unique_track_id')) {
      db.exec('ALTER TABLE tracks ADD COLUMN unique_track_id INTEGER REFERENCES unique_tracks(id) ON DELETE SET NULL');
    }
  } catch (_) {}

  db.exec(`
    CREATE INDEX IF NOT EXISTS tracks_artist_idx ON tracks (artist);
    CREATE INDEX IF NOT EXISTS tracks_unique_track_id_idx ON tracks (unique_track_id);
    CREATE INDEX IF NOT EXISTS episodes_scheduled_at_idx ON episodes (scheduled_at);
    CREATE INDEX IF NOT EXISTS episodes_program_id_idx ON episodes (program_id);
    CREATE INDEX IF NOT EXISTS unique_tracks_play_count_idx ON unique_tracks (play_count);
    CREATE INDEX IF NOT EXISTS unique_tracks_artist_idx ON unique_tracks (artist);
  `);

  // Backfill existing episodes missing program_id to default Kauamängiv program
  try {
    const kauamangiv = ensureProgram(db, { seriesId: '1037846', title: 'Kauamängiv', slug: 'kauamangiv' });
    db.prepare('UPDATE episodes SET program_id = ? WHERE program_id IS NULL').run(kauamangiv.id);
  } catch (_) {}

  // Backfill unique_tracks for any existing unlinked tracks
  try {
    backfillUniqueTracks(db);
  } catch (err) {
    console.warn('[Keeris DB] Unique track backfill warning:', err.message);
  }

  return db;
}

export function makeFingerprint(artist, title, rawText) {
  const normArtist = (artist ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const normTitle = (title ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (normArtist || normTitle) return `${normArtist}___${normTitle}`;
  return (rawText ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function ensureUniqueTrack(db, artist, title, rawText, playedAt = null) {
  const fingerprint = makeFingerprint(artist, title, rawText);
  if (!fingerprint) return null;

  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM unique_tracks WHERE fingerprint = ?').get(fingerprint);

  if (existing) {
    const count = existing.play_count + 1;
    const firstPlayed = existing.first_played_at ? (playedAt && playedAt < existing.first_played_at ? playedAt : existing.first_played_at) : playedAt;
    const lastPlayed = existing.last_played_at ? (playedAt && playedAt > existing.last_played_at ? playedAt : existing.last_played_at) : playedAt;
    db.prepare('UPDATE unique_tracks SET play_count = ?, first_played_at = ?, last_played_at = ?, updated_at = ? WHERE id = ?')
      .run(count, firstPlayed, lastPlayed, now, existing.id);
    return existing.id;
  }

  const result = db.prepare(`INSERT INTO unique_tracks (fingerprint, artist, title, play_count, first_played_at, last_played_at, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?)`).run(fingerprint, artist ?? null, title ?? null, playedAt, playedAt, now, now);
  return Number(result.lastInsertRowid);
}

export function backfillUniqueTracks(db) {
  const unlinked = db.prepare(`SELECT t.id, t.artist, t.title, t.raw_text, e.scheduled_at
    FROM tracks t JOIN episodes e ON e.id = t.episode_id
    WHERE t.unique_track_id IS NULL`).all();

  if (!unlinked.length) return;

  const now = new Date().toISOString();
  const existingRows = db.prepare('SELECT id, fingerprint, play_count, first_played_at, last_played_at FROM unique_tracks').all();
  const cache = new Map(existingRows.map(r => [r.fingerprint, r]));

  const insertStmt = db.prepare(`INSERT INTO unique_tracks (fingerprint, artist, title, play_count, first_played_at, last_played_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const updateCountStmt = db.prepare('UPDATE unique_tracks SET play_count = ?, first_played_at = ?, last_played_at = ?, updated_at = ? WHERE id = ?');
  const updateTrackStmt = db.prepare('UPDATE tracks SET unique_track_id = ? WHERE id = ?');

  db.exec('BEGIN');
  try {
    for (const row of unlinked) {
      const fingerprint = makeFingerprint(row.artist, row.title, row.raw_text);
      if (!fingerprint) continue;

      let rec = cache.get(fingerprint);
      const playedAt = row.scheduled_at ?? null;

      if (rec) {
        rec.play_count += 1;
        if (playedAt && (!rec.first_played_at || playedAt < rec.first_played_at)) rec.first_played_at = playedAt;
        if (playedAt && (!rec.last_played_at || playedAt > rec.last_played_at)) rec.last_played_at = playedAt;
        rec.dirty = true;
      } else {
        const res = insertStmt.run(fingerprint, row.artist ?? null, row.title ?? null, 1, playedAt, playedAt, now, now);
        rec = { id: Number(res.lastInsertRowid), fingerprint, play_count: 1, first_played_at: playedAt, last_played_at: playedAt, dirty: false };
        cache.set(fingerprint, rec);
      }

      updateTrackStmt.run(rec.id, row.id);
    }

    for (const rec of cache.values()) {
      if (rec.dirty) {
        updateCountStmt.run(rec.play_count, rec.first_played_at, rec.last_played_at, now, rec.id);
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function ensureProgram(db, { seriesId, title, slug = null, description = null, url = null }) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO programs (series_id, title, slug, description, url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(series_id) DO UPDATE SET title=excluded.title, slug=coalesce(excluded.slug, programs.slug),
    description=coalesce(excluded.description, programs.description), url=coalesce(excluded.url, programs.url),
    updated_at=excluded.updated_at`).run(seriesId, title, slug, description, url, now, now);
  return db.prepare('SELECT * FROM programs WHERE series_id = ?').get(seriesId);
}

export function saveProgramData(db, { program, episode, tracks = [], metadata = {}, rawHash = null, status = 'parsed', error = null }) {
  const now = new Date().toISOString();
  let programRecord = null;
  db.exec('BEGIN');
  try {
    if (program?.seriesId) {
      programRecord = ensureProgram(db, program);
    }

    db.prepare(`INSERT INTO episodes (id, program_id, url, title, scheduled_at, published_at, fetched_at, raw_hash, parse_status, parse_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET program_id=coalesce(excluded.program_id, episodes.program_id), url=excluded.url,
      title=excluded.title, scheduled_at=excluded.scheduled_at, published_at=excluded.published_at,
      fetched_at=excluded.fetched_at, raw_hash=excluded.raw_hash, parse_status=excluded.parse_status,
      parse_error=excluded.parse_error`).run(
      episode.id, programRecord?.id ?? episode.programId ?? null, episode.url, episode.heading ?? episode.title ?? 'Episode',
      episode.scheduledAt ?? null, episode.publishedAt ?? null, now, rawHash, status, error
    );

    if (tracks && tracks.length > 0) {
      db.prepare('DELETE FROM tracks WHERE episode_id = ?').run(episode.id);
      const insertTrack = db.prepare('INSERT INTO tracks (episode_id, unique_track_id, position, artist, title, raw_text) VALUES (?, ?, ?, ?, ?, ?)');
      for (const track of tracks) {
        const uId = ensureUniqueTrack(db, track.artist, track.title, track.rawText, episode.scheduledAt ?? null);
        insertTrack.run(episode.id, uId, track.position, track.artist, track.title, track.rawText);
      }
    }

    if (metadata && (metadata.description || metadata.fullText || metadata.summary || metadata.keywords)) {
      db.prepare(`INSERT INTO episode_metadata (episode_id, description, full_text, summary, keywords)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(episode_id) DO UPDATE SET description=excluded.description, full_text=excluded.full_text,
        summary=excluded.summary, keywords=excluded.keywords`).run(
        episode.id, metadata.description ?? null, metadata.fullText ?? null, metadata.summary ?? null, metadata.keywords ?? null
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function saveEpisode(db, episode, tracks, { rawHash = null, status = 'parsed', error = null } = {}) {
  return saveProgramData(db, { program: { seriesId: '1037846', title: 'Kauamängiv' }, episode, tracks, rawHash, status, error });
}