import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

let sqlite3Instance = null;
let dbInstance = null;

export async function initSqliteOpfs({ seedUrl = '/data/keeris-seed.sqlite3', dbFileName = '/keeris.sqlite3' } = {}) {
  if (dbInstance) return { sqlite3: sqlite3Instance, db: dbInstance };

  sqlite3Instance = await sqlite3InitModule({
    print: console.log,
    printErr: console.error,
  });

  console.log('[SQLite WASM] Initialized SQLite version:', sqlite3Instance.version.libVersion);

  if ('opfs' in sqlite3Instance) {
    console.log('[SQLite WASM] Opening persistent OPFS database:', dbFileName);
    dbInstance = new sqlite3Instance.oo1.OpfsDb(dbFileName);
  } else {
    console.warn('[SQLite WASM] OPFS not supported in browser environment, falling back to transient memory DB');
    dbInstance = new sqlite3Instance.oo1.DB(dbFileName, 'c');
  }

  // 1. Ensure baseline tables exist first
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      slug TEXT UNIQUE,
      description TEXT,
      url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS episodes (
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

    CREATE TABLE IF NOT EXISTS unique_tracks (
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      unique_track_id INTEGER REFERENCES unique_tracks(id) ON DELETE SET NULL,
      track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
      episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
      position INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Curator AST Tables
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      ast TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      script_id TEXT REFERENCES scripts(id) ON DELETE SET NULL,
      schedule TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Check if database contains populated domain tables
  let hasData = false;
  try {
    const res = [];
    dbInstance.exec({
      sql: "SELECT COUNT(*) as count FROM episodes",
      rowMode: 'object',
      resultRows: res,
    });
    if (res.length > 0 && res[0].count > 0) {
      hasData = true;
      console.log(`[SQLite WASM] Found existing populated OPFS database with ${res[0].count} episodes.`);
    }
  } catch (err) {
    console.warn('[SQLite WASM] Episodes table missing or empty:', err.message);
  }

  // 3. Auto-hydrate from seed if empty
  if (!hasData) {
    await rehydrateFromSeed(seedUrl);
  }

  return { sqlite3: sqlite3Instance, db: dbInstance };
}

export async function rehydrateFromSeed(seedUrl = '/data/keeris-seed.sqlite3') {
  if (!dbInstance || !sqlite3Instance) {
    console.warn('[SQLite WASM] Cannot rehydrate, database instance not initialized');
    return false;
  }

  console.log(`[SQLite WASM] Hydrating OPFS database from seed URL: ${seedUrl}...`);
  try {
    const response = await fetch(seedUrl);
    if (!response.ok) {
      console.warn(`[SQLite WASM] Seed snapshot fetch returned HTTP ${response.status}`);
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const p = sqlite3Instance.wasm.allocFromZone(bytes.length);
    sqlite3Instance.wasm.heap8u().set(bytes, p);
    
    const flags = sqlite3Instance.capi.SQLITE_DESERIALIZE_FREEONCLOSE | (sqlite3Instance.capi.SQLITE_DESERIALIZE_RESIZEABLE || 2);
    const rc = sqlite3Instance.capi.sqlite3_deserialize(
      dbInstance.pointer,
      'main',
      p,
      bytes.length,
      bytes.length,
      flags
    );

    console.log('[SQLite WASM] sqlite3_deserialize return code:', rc);

    const check = [];
    dbInstance.exec({
      sql: "SELECT COUNT(*) as count FROM unique_tracks",
      rowMode: 'object',
      resultRows: check,
    });

    console.log(`[SQLite WASM] Successfully hydrated OPFS database from seed URL. Unique tracks count: ${check[0]?.count || 0}`);
    return true;
  } catch (err) {
    console.error('[SQLite WASM] Rehydration failed:', err);
    return false;
  }
}
