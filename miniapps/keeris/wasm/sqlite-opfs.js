import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SCHEMA_DDL } from './generated-schema.js';

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

export async function initSqliteOpfs({ seedUrl = '/data/keeris-seed.sqlite3', dbFileName = 'keeris.sqlite3' } = {}) {
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
  ensureBaselineTables(dbInstance);

  // 2. Check if this is a fresh, unseeded database
  let isSeeded = false;
  try {
    const res = [];
    dbInstance.exec({
      sql: 'SELECT COUNT(*) as count FROM programs',
      rowMode: 'object',
      resultRows: res,
    });
    isSeeded = (res[0]?.count || 0) > 0;
  } catch (_) {}

  // 3. Auto-hydrate from seed snapshot on initial launch
  if (!isSeeded && seedUrl) {
    console.log(`[SQLite WASM] Database is unseeded. Auto-hydrating from seed snapshot (${seedUrl})...`);
    try {
      const response = await fetch(seedUrl);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > 1000) {
          if (dbInstance) {
            try { dbInstance.close(); } catch (_) {}
            dbInstance = null;
          }
          if ('opfs' in sqlite3Instance) {
            await sqlite3Instance.oo1.OpfsDb.importDb(opfsPath, new Uint8Array(arrayBuffer));
            dbInstance = await openOpfsDbWithRetry(opfsPath);
          } else {
            dbInstance = new sqlite3Instance.oo1.DB(opfsPath, 'c');
            sqlite3Instance.capi.sqlite3_deserialize(
              dbInstance.pointer, 'main',
              new Uint8Array(arrayBuffer),
              arrayBuffer.byteLength,
              arrayBuffer.byteLength,
              sqlite3Instance.capi.SQLITE_DESERIALIZE_RESIZEABLE
            );
          }
          ensureBaselineTables(dbInstance);
          console.log(`[SQLite WASM] Auto-hydration complete (${arrayBuffer.byteLength} bytes).`);
        }
      } else {
        console.warn(`[SQLite WASM] Seed snapshot fetch returned HTTP ${response.status}`);
      }
    } catch (seedErr) {
      console.warn('[SQLite WASM] Auto-hydration skipped:', seedErr.message);
      if (!dbInstance) {
        if ('opfs' in sqlite3Instance) {
          dbInstance = await openOpfsDbWithRetry(opfsPath);
        } else {
          dbInstance = new sqlite3Instance.oo1.DB(opfsPath, 'c');
        }
        ensureBaselineTables(dbInstance);
      }
    }
  }

  ensureBaselineTables(dbInstance);
  return { sqlite3: sqlite3Instance, db: dbInstance };
}

export function ensureBaselineTables(db) {
  if (!db) return;
  db.exec(SCHEMA_DDL);
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

/** Export the OPFS SQLite database as an ArrayBuffer for downloading. */
export async function exportDatabaseBlob(dbFileName = 'keeris.sqlite3') {
  const cleanName = dbFileName.startsWith('/') ? dbFileName.slice(1) : dbFileName;
  console.log(`[SQLite WASM] Exporting database '${cleanName}'...`);
  if (dbInstance) {
    try {
      dbInstance.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (_) {}
  }

  if (sqlite3Instance && 'opfs' in sqlite3Instance) {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(cleanName);
    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    return arrayBuffer;
  } else if (dbInstance && sqlite3Instance) {
    const data = sqlite3Instance.capi.sqlite3_js_db_export(dbInstance.pointer);
    return data.buffer;
  }
  throw new Error('No active database instance available to export');
}

/** Import a binary SQLite ArrayBuffer directly into OPFS, replacing current data. */
export async function importDatabaseFile(arrayBuffer, dbFileName = 'keeris.sqlite3') {
  console.log(`[SQLite WASM] Importing database (${arrayBuffer.byteLength} bytes) into '${dbFileName}'...`);
  if (!sqlite3Instance) {
    throw new Error('SQLite WASM instance not initialized');
  }

  const opfsPath = dbFileName.startsWith('/') ? dbFileName : `/${dbFileName}`;
  if (dbInstance) {
    try { dbInstance.close(); } catch (_) {}
    dbInstance = null;
  }

  if ('opfs' in sqlite3Instance) {
    await sqlite3Instance.oo1.OpfsDb.importDb(opfsPath, new Uint8Array(arrayBuffer));
    dbInstance = await openOpfsDbWithRetry(opfsPath);
  } else {
    dbInstance = new sqlite3Instance.oo1.DB(opfsPath, 'c');
    sqlite3Instance.capi.sqlite3_deserialize(
      dbInstance.pointer, 'main',
      new Uint8Array(arrayBuffer),
      arrayBuffer.byteLength,
      arrayBuffer.byteLength,
      sqlite3Instance.capi.SQLITE_DESERIALIZE_RESIZEABLE
    );
  }

  ensureBaselineTables(dbInstance);
  console.log('[SQLite WASM] Database imported successfully.');
  return true;
}


