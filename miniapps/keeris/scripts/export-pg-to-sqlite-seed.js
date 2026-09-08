import pg from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync } from 'node:fs';

async function exportPgToSqlite() {
  const client = new pg.Client('postgresql://curator:curator_secret@192.168.1.110:5432/keeris');
  await client.connect();

  const dbPath = 'data/keeris.db';
  const seedPath = 'data/keeris-seed.sqlite3';
  const db = new DatabaseSync(dbPath);

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN IMMEDIATE;');

  try {
    db.exec(`
      DROP TABLE IF EXISTS playlist_items;
      DROP TABLE IF EXISTS playlists;
      DROP TABLE IF EXISTS episode_metadata;
      DROP TABLE IF EXISTS tracks;
      DROP TABLE IF EXISTS unique_tracks;
      DROP TABLE IF EXISTS episodes;
      DROP TABLE IF EXISTS programs;

      CREATE TABLE programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        series_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        slug TEXT UNIQUE,
        description TEXT,
        url TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE episodes (
        id INTEGER PRIMARY KEY,
        program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
        url TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        scheduled_at TEXT,
        published_at TEXT,
        fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        raw_hash TEXT,
        parse_status TEXT DEFAULT 'pending',
        parse_error TEXT
      );

      CREATE TABLE unique_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint TEXT UNIQUE NOT NULL,
        artist TEXT,
        title TEXT,
        play_count INTEGER DEFAULT 1,
        first_played_at TEXT,
        last_played_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
        unique_track_id INTEGER REFERENCES unique_tracks(id) ON DELETE SET NULL,
        position INTEGER NOT NULL,
        artist TEXT,
        title TEXT,
        raw_text TEXT NOT NULL,
        UNIQUE(episode_id, position)
      );

      CREATE TABLE episode_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        episode_id INTEGER UNIQUE NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
        description TEXT,
        full_text TEXT,
        summary TEXT,
        keywords TEXT
      );

      CREATE TABLE playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE playlist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        unique_track_id INTEGER REFERENCES unique_tracks(id) ON DELETE SET NULL,
        track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
        episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
        position INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('1. Exporting programs...');
    const progs = await client.query('SELECT * FROM programs');
    const insProg = db.prepare('INSERT INTO programs (id, series_id, title, slug, description, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of progs.rows) {
      insProg.run(p.id, p.series_id, p.title, p.slug, p.description, p.url, String(p.created_at || ''), String(p.updated_at || ''));
    }

    console.log('2. Exporting episodes...');
    const eps = await client.query('SELECT * FROM episodes');
    const insEp = db.prepare('INSERT INTO episodes (id, program_id, url, title, scheduled_at, published_at, fetched_at, raw_hash, parse_status, parse_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const e of eps.rows) {
      insEp.run(e.id, e.program_id, e.url, e.title, e.scheduled_at, e.published_at, e.fetched_at, e.raw_hash, e.parse_status, e.parse_error);
    }

    console.log('3. Exporting unique_tracks...');
    const uts = await client.query('SELECT * FROM unique_tracks');
    const insUt = db.prepare('INSERT INTO unique_tracks (id, fingerprint, artist, title, play_count, first_played_at, last_played_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const u of uts.rows) {
      insUt.run(u.id, u.fingerprint, u.artist, u.title, u.play_count, u.first_played_at, u.last_played_at, String(u.created_at || ''), String(u.updated_at || ''));
    }

    console.log('4. Exporting tracks...');
    const trs = await client.query('SELECT * FROM tracks');
    const insTr = db.prepare('INSERT INTO tracks (id, episode_id, unique_track_id, position, artist, title, raw_text) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const t of trs.rows) {
      insTr.run(t.id, t.episode_id, t.unique_track_id, t.position, t.artist, t.title, t.raw_text);
    }

    console.log('5. Exporting episode_metadata...');
    const metas = await client.query('SELECT * FROM episode_metadata');
    const insMeta = db.prepare('INSERT INTO episode_metadata (id, episode_id, description, full_text, summary, keywords) VALUES (?, ?, ?, ?, ?, ?)');
    for (const m of metas.rows) {
      insMeta.run(m.id, m.episode_id, m.description, m.full_text, m.summary, m.keywords);
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
    db.close();
    await client.end();
  }

  copyFileSync(dbPath, seedPath);
  console.log('✓ Successfully exported 100% of PostgreSQL data into data/keeris.db & data/keeris-seed.sqlite3!');
}

exportPgToSqlite().catch(console.error);
