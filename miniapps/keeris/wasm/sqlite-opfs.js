import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

let sqlite3Instance = null;
let dbInstance = null;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

/**
 * OPFS only allows one exclusive sync-access-handle per file at a time across
 * the whole browser (all tabs/workers). A stale lock from a previous tab or an
 * abruptly-closed worker surfaces here as SQLITE_CANTOPEN. Retry with backoff
 * before giving up, since the lock is often released shortly after.
 */
async function openOpfsDbWithRetry(opfsPath, { attempts = 5, delayMs = 400 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const db = new sqlite3Instance.oo1.OpfsDb(opfsPath);
      db.exec('SELECT 1'); // cheap probe: forces the first real I/O now, inside this try block
      if (attempt > 1) console.log(`[SQLite WASM] OPFS db opened successfully on attempt ${attempt}.`);
      return db;
    } catch (err) {
      const isCantOpen = String(err.message || err).includes('SQLITE_CANTOPEN');
      if (!isCantOpen || attempt === attempts) {
        if (isCantOpen) {
          console.error(`[SQLite WASM] OPFS db still locked after ${attempts} attempts. ` +
            'Close any other tabs/windows of this app (OPFS allows only one writer per file) and reload.');
        }
        throw err;
      }
      console.warn(`[SQLite WASM] OPFS db open attempt ${attempt}/${attempts} failed (${err.message}), retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }
}

export async function initSqliteOpfs({ seedUrl = '/data/keeris.db', dbFileName = 'keeris.sqlite3' } = {}) {
  if (dbInstance) return { sqlite3: sqlite3Instance, db: dbInstance };

  sqlite3Instance = await sqlite3InitModule({
    print: console.log,
    printErr: console.error,
  });

  console.log('[SQLite WASM] Initialized SQLite version:', sqlite3Instance.version.libVersion);

  const opfsPath = dbFileName.startsWith('/') ? dbFileName : `/${dbFileName}`;

  if ('opfs' in sqlite3Instance) {
    console.log('[SQLite WASM] Opening persistent OPFS database:', opfsPath);
    try {
      dbInstance = await openOpfsDbWithRetry(opfsPath);
    } catch (err) {
      // OPFS allows only ONE open connection per file across the whole browser
      // (all tabs/windows). This is almost always another tab of this same app
      // already holding the file open, NOT real corruption - do NOT delete or
      // reimport here, that would destroy real scraped data out from under the
      // other tab. Fail loudly and tell the user how to fix it instead.
      const message = `OPFS database '${dbFileName}' is locked by another open tab/window of this app ` +
        '(OPFS allows only one connection per file at a time). Close the other tab(s) and reload this page.';
      console.error(`[SQLite WASM] ${message}`, err);
      throw new Error(message);
    }
  } else {
    console.warn('[SQLite WASM] OPFS not supported, falling back to transient memory DB');
    dbInstance = new sqlite3Instance.oo1.DB(opfsPath, 'c');
  }

  // Without this, every INSERT/UPDATE outside an explicit transaction does a
  // full synchronous flush to the OPFS file - the classic cause of "slow" local
  // SQLite in the browser. This data is a re-scrapeable cache, not a system of
  // record, so trading strict crash-durability for throughput is safe here.
  try {
    dbInstance.exec('PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -20000;');
  } catch (err) {
    console.warn('[SQLite WASM] Failed to apply performance pragmas:', err.message);
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
    CREATE INDEX IF NOT EXISTS idx_episodes_program_id ON episodes(program_id);

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
    CREATE INDEX IF NOT EXISTS idx_tracks_episode_id ON tracks(episode_id);
    CREATE INDEX IF NOT EXISTS idx_tracks_unique_track_id ON tracks(unique_track_id);


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
      is_active INTEGER DEFAULT 0,
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

  return { sqlite3: sqlite3Instance, db: dbInstance };
}

/** Return the currently-open db connection (may change after rehydrateFromSeed closes/reopens it). */
export function getCurrentDb() {
  return dbInstance;
}

export async function rehydrateFromSeed(seedUrl = '/data/keeris-seed.sqlite3', dbFileName = 'keeris.sqlite3') {
  if (!sqlite3Instance) {
    console.warn('[SQLite WASM] Cannot rehydrate, sqlite3 not initialized');
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

    // Close the connection, then import via OpfsDb.importDb() rather than a raw
    // File System Access write, so the OPFS VFS's bookkeeping matches the file
    // (a raw overwrite can leave the file unreadable to the VFS - SQLITE_CANTOPEN).
    if (dbInstance) {
      try { dbInstance.close(); } catch (_) {}
      dbInstance = null;
    }

    const opfsPath = dbFileName.startsWith('/') ? dbFileName : `/${dbFileName}`;
    await sqlite3Instance.oo1.OpfsDb.importDb(opfsPath, new Uint8Array(arrayBuffer));
    dbInstance = await openOpfsDbWithRetry(opfsPath);

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

/** Close the connection and delete the OPFS file entirely, for iterating on tests. */
export async function resetDatabase(dbFileName = 'keeris.sqlite3') {
  console.log(`[SQLite WASM] Resetting database: deleting OPFS file '${dbFileName}'...`);
  try {
    if (dbInstance) {
      try { dbInstance.close(); } catch (_) {}
      dbInstance = null;
    }
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(dbFileName);
    console.log('[SQLite WASM] Database reset complete. Reload the page to start fresh.');
    return true;
  } catch (err) {
    console.error('[SQLite WASM] Reset failed:', err);
    return false;
  }
}

