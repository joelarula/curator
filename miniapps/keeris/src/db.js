import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

export function normalizeText(text) {
  if (text == null) return '';
  return String(text).normalize('NFC').toLowerCase();
}

export function makeFingerprint(artist, title, rawText) {
  const normArtist = (artist ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const normTitle = (title ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (normArtist || normTitle) return `${normArtist}___${normTitle}`;
  return (rawText ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function convertSqlToPg(sql) {
  let paramIndex = 1;
  return sql
    .replace(/\?/g, () => `$${paramIndex++}`)
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    .replace(/INTEGER PRIMARY KEY/gi, 'INTEGER PRIMARY KEY')
    .replace(/sqlite_master/gi, 'information_schema.tables');
}

export async function ensurePostgresSchema(pool) {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS unaccent;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE OR REPLACE FUNCTION immutable_unaccent(text)
      RETURNS text AS
    $$
    SELECT public.unaccent('public.unaccent', $1)
    $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

    CREATE TABLE IF NOT EXISTS programs (
      id SERIAL PRIMARY KEY,
      series_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      slug TEXT UNIQUE,
      description TEXT,
      url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY,
      program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
      url TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      scheduled_at TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      raw_hash TEXT,
      parse_status TEXT DEFAULT 'pending',
      parse_error TEXT
    );

    CREATE TABLE IF NOT EXISTS unique_tracks (
      id SERIAL PRIMARY KEY,
      fingerprint TEXT UNIQUE NOT NULL,
      artist TEXT,
      title TEXT,
      play_count INTEGER DEFAULT 1,
      first_played_at TEXT,
      last_played_at TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id SERIAL PRIMARY KEY,
      episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      unique_track_id INTEGER REFERENCES unique_tracks(id) ON DELETE SET NULL,
      position INTEGER NOT NULL,
      artist TEXT,
      title TEXT,
      raw_text TEXT NOT NULL,
      UNIQUE(episode_id, position)
    );

    CREATE TABLE IF NOT EXISTS episode_metadata (
      id SERIAL PRIMARY KEY,
      episode_id INTEGER UNIQUE NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      description TEXT,
      full_text TEXT,
      summary TEXT,
      keywords TEXT
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS playlist_items (
      id SERIAL PRIMARY KEY,
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      unique_track_id INTEGER REFERENCES unique_tracks(id) ON DELETE SET NULL,
      track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
      position INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_pos ON playlist_items(playlist_id, position);

    CREATE INDEX IF NOT EXISTS idx_episodes_scheduled_at ON episodes(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_episodes_program_id ON episodes(program_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_unique_track_id ON tracks(unique_track_id);
    CREATE INDEX IF NOT EXISTS idx_unique_tracks_play_count ON unique_tracks(play_count);
    CREATE INDEX IF NOT EXISTS idx_unique_tracks_artist ON unique_tracks(artist);

    CREATE INDEX IF NOT EXISTS idx_trgm_tracks_artist ON tracks USING gin (immutable_unaccent(lower(artist)) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_trgm_tracks_title ON tracks USING gin (immutable_unaccent(lower(title)) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_trgm_unique_tracks_artist ON unique_tracks USING gin (immutable_unaccent(lower(artist)) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_trgm_unique_tracks_title ON unique_tracks USING gin (immutable_unaccent(lower(title)) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_trgm_episodes_title ON episodes USING gin (immutable_unaccent(lower(title)) gin_trgm_ops);
  `);
}

export function ensureSchema(db) {
  if (db.isPostgres) return;
  try {
    const hasTables = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='episodes'").get();
    if (hasTables && hasTables.count > 0) return;
  } catch (_) {}

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        series_id TEXT UNIQUE NOT NULL,
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
        url TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        scheduled_at TEXT,
        published_at TEXT,
        fetched_at TEXT NOT NULL,
        raw_hash TEXT,
        parse_status TEXT DEFAULT 'pending',
        parse_error TEXT
      );

      CREATE TABLE IF NOT EXISTS unique_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint TEXT UNIQUE NOT NULL,
        artist TEXT,
        title TEXT,
        play_count INTEGER DEFAULT 1,
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
        UNIQUE(episode_id, position)
      );

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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS playlist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        unique_track_id INTEGER REFERENCES unique_tracks(id) ON DELETE SET NULL,
        track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
        episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
        position INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_pos ON playlist_items(playlist_id, position);

      CREATE INDEX IF NOT EXISTS idx_episodes_scheduled_at ON episodes(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_episodes_program_id ON episodes(program_id);
      CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
      CREATE INDEX IF NOT EXISTS idx_tracks_unique_track_id ON tracks(unique_track_id);
      CREATE INDEX IF NOT EXISTS idx_unique_tracks_play_count ON unique_tracks(play_count);
      CREATE INDEX IF NOT EXISTS idx_unique_tracks_artist ON unique_tracks(artist);
    `);
  } catch (_) {}
}

export function createPostgresAdapter(connectionString) {
  const pool = new pg.Pool({ connectionString });
  
  // Background ensure schema
  ensurePostgresSchema(pool).catch(err => {
    console.warn('[PostgreSQL] Schema initialization notice:', err.message);
  });

  const adapter = {
    isPostgres: true,
    pool,
    prepare(sql) {
      const pgSql = convertSqlToPg(sql);
      return {
        async all(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const res = await pool.query(pgSql, flatParams);
          return res.rows;
        },
        async get(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const res = await pool.query(pgSql, flatParams);
          return res.rows[0] || null;
        },
        async run(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const res = await pool.query(pgSql, flatParams);
          return {
            changes: res.rowCount,
            lastInsertRowid: res.rows[0]?.id ?? null
          };
        }
      };
    },
    async exec(sql) {
      return await pool.query(sql);
    },
    async close() {
      await pool.end();
    }
  };

  return adapter;
}

export function openDatabase(filenameOrUrl) {
  if (typeof filenameOrUrl === 'string' && (filenameOrUrl.startsWith('postgres://') || filenameOrUrl.startsWith('postgresql://'))) {
    return createPostgresAdapter(filenameOrUrl);
  }

  mkdirSync(dirname(filenameOrUrl), { recursive: true });
  const db = new DatabaseSync(filenameOrUrl);
  db.isPostgres = false;

  try {
    db.function('norm_text', (text) => normalizeText(text));
    db.function('lower_utf', (text) => (text == null ? '' : String(text).toLocaleLowerCase('et-EE')));
  } catch (_) {}

  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA temp_store = MEMORY;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -64000;
      PRAGMA busy_timeout = 10000;
    `);
  } catch (_) {}

  try {
    db.exec(`PRAGMA journal_mode = WAL;`);
  } catch (_) {
    try {
      db.exec(`PRAGMA journal_mode = DELETE;`);
    } catch (_) {}
  }

  ensureSchema(db);

  return db;
}

export async function ensureUniqueTrack(db, artist, title, rawText, playedAt = null) {
  const fingerprint = makeFingerprint(artist, title, rawText);
  if (!fingerprint) return null;

  const now = new Date().toISOString();
  const existing = await db.prepare('SELECT * FROM unique_tracks WHERE fingerprint = ?').get(fingerprint);

  if (existing) {
    const count = existing.play_count + 1;
    const firstPlayed = existing.first_played_at ? (playedAt && playedAt < existing.first_played_at ? playedAt : existing.first_played_at) : playedAt;
    const lastPlayed = existing.last_played_at ? (playedAt && playedAt > existing.last_played_at ? playedAt : existing.last_played_at) : playedAt;
    await db.prepare('UPDATE unique_tracks SET play_count = ?, first_played_at = ?, last_played_at = ?, updated_at = ? WHERE id = ?')
      .run(count, firstPlayed, lastPlayed, now, existing.id);
    return existing.id;
  }

  if (db.isPostgres) {
    const res = await db.pool.query(`
      INSERT INTO unique_tracks (fingerprint, artist, title, play_count, first_played_at, last_played_at, created_at, updated_at)
      VALUES ($1, $2, $3, 1, $4, $5, $6, $7)
      RETURNING id
    `, [fingerprint, artist ?? null, title ?? null, playedAt, playedAt, now, now]);
    return res.rows[0]?.id;
  }

  const result = db.prepare(`INSERT INTO unique_tracks (fingerprint, artist, title, play_count, first_played_at, last_played_at, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?)`).run(fingerprint, artist ?? null, title ?? null, playedAt, playedAt, now, now);
  return Number(result.lastInsertRowid);
}

export async function ensureProgram(db, { seriesId, title, slug = null, description = null, url = null }) {
  const now = new Date().toISOString();
  if (db.isPostgres) {
    const res = await db.pool.query(`
      INSERT INTO programs (series_id, title, slug, description, url, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT(series_id) DO UPDATE SET
        title = EXCLUDED.title,
        slug = COALESCE(EXCLUDED.slug, programs.slug),
        description = COALESCE(EXCLUDED.description, programs.description),
        url = COALESCE(EXCLUDED.url, programs.url),
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [seriesId, title, slug, description, url, now, now]);
    return res.rows[0];
  }

  db.prepare(`INSERT INTO programs (series_id, title, slug, description, url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(series_id) DO UPDATE SET title=excluded.title, slug=coalesce(excluded.slug, programs.slug),
    description=coalesce(excluded.description, programs.description), url=coalesce(excluded.url, programs.url),
    updated_at=excluded.updated_at`).run(seriesId, title, slug, description, url, now, now);
  return db.prepare('SELECT * FROM programs WHERE series_id = ?').get(seriesId);
}

export async function saveProgramData(db, { program, episode, tracks = [], metadata = {}, rawHash = null, status = 'parsed', error = null }) {
  const now = new Date().toISOString();
  let programRecord = null;
  
  if (db.isPostgres) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      if (program?.seriesId) {
        const res = await client.query(`
          INSERT INTO programs (series_id, title, slug, description, url, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (series_id) DO UPDATE SET
            title = EXCLUDED.title,
            slug = COALESCE(EXCLUDED.slug, programs.slug),
            description = COALESCE(EXCLUDED.description, programs.description),
            url = COALESCE(EXCLUDED.url, programs.url),
            updated_at = EXCLUDED.updated_at
          RETURNING id
        `, [program.seriesId, program.title, program.slug ?? null, program.description ?? null, program.url ?? null, now, now]);
        programRecord = res.rows[0];
      }

      await client.query(`
        INSERT INTO episodes (id, program_id, url, title, scheduled_at, published_at, fetched_at, raw_hash, parse_status, parse_error)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          program_id = COALESCE(EXCLUDED.program_id, episodes.program_id),
          url = EXCLUDED.url,
          title = EXCLUDED.title,
          scheduled_at = EXCLUDED.scheduled_at,
          published_at = EXCLUDED.published_at,
          fetched_at = EXCLUDED.fetched_at,
          raw_hash = EXCLUDED.raw_hash,
          parse_status = EXCLUDED.parse_status,
          parse_error = EXCLUDED.parse_error
      `, [
        episode.id, programRecord?.id ?? episode.programId ?? null, episode.url, episode.heading ?? episode.title ?? 'Episode',
        episode.scheduledAt ?? null, episode.publishedAt ?? null, now, rawHash, status, error
      ]);

      if (tracks && tracks.length > 0) {
        await client.query('DELETE FROM tracks WHERE episode_id = $1', [episode.id]);
        for (const track of tracks) {
          const uId = await ensureUniqueTrack(db, track.artist, track.title, track.rawText, episode.scheduledAt ?? null);
          await client.query(`
            INSERT INTO tracks (episode_id, unique_track_id, position, artist, title, raw_text)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [episode.id, uId, track.position, track.artist, track.title, track.rawText]);
        }
      }

      if (metadata && (metadata.description || metadata.fullText || metadata.summary || metadata.keywords)) {
        await client.query(`
          INSERT INTO episode_metadata (episode_id, description, full_text, summary, keywords)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (episode_id) DO UPDATE SET
            description = EXCLUDED.description,
            full_text = EXCLUDED.full_text,
            summary = EXCLUDED.summary,
            keywords = EXCLUDED.keywords
        `, [episode.id, metadata.description ?? null, metadata.fullText ?? null, metadata.summary ?? null, metadata.keywords ?? null]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  // SQLite fallback
  db.exec('BEGIN');
  try {
    if (program?.seriesId) {
      programRecord = await ensureProgram(db, program);
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
        const uId = await ensureUniqueTrack(db, track.artist, track.title, track.rawText, episode.scheduledAt ?? null);
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