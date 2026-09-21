import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SCHEMA_DDL } from './generated-schema.js';
import { PROGRAM_MANIFEST } from './wasm-curator-engine.ts';
import type { Sqlite3Instance, OpfsDatabase } from './types';

let sqlite3Instance: Sqlite3Instance | null = null;
let dbInstance: OpfsDatabase | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface InitSqliteOptions {
  seedUrl?: string;
  dbFileName?: string;
}

export interface InitSqliteResult {
  sqlite3: Sqlite3Instance;
  db: OpfsDatabase;
  isOpfs: boolean;
}

/**
 * OPFS only allows one exclusive sync-access-handle per file at a time across
 * the whole browser (all tabs/workers). A stale lock from a previous tab or an
 * abruptly-closed worker surfaces here as SQLITE_CANTOPEN. Retry with backoff
 * before giving up.
 */
async function openOpfsDbWithRetry(
  opfsPath: string,
  { attempts = 5, delayMs = 400 } = {}
): Promise<OpfsDatabase> {
  if (!sqlite3Instance) {
    throw new Error('sqlite3Instance is not initialized');
  }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const db = new sqlite3Instance.oo1.OpfsDb(opfsPath);
      db.exec('SELECT 1'); // cheap probe: forces the first real I/O inside this try block
      if (attempt > 1) {
        console.log(`[SQLite WASM] OPFS db opened successfully on attempt ${attempt}.`);
      }
      return db;
    } catch (err: any) {
      const isCantOpen = String(err?.message || err).includes('SQLITE_CANTOPEN');
      if (!isCantOpen || attempt === attempts) {
        if (isCantOpen) {
          console.error(
            `[SQLite WASM] OPFS db still locked after ${attempts} attempts. ` +
              'Close any other tabs/windows of this app (OPFS allows only one connection per file at a time) and reload.'
          );
        }
        throw err;
      }
      console.warn(
        `[SQLite WASM] OPFS db open attempt ${attempt}/${attempts} failed (${err?.message}), retrying in ${delayMs}ms...`
      );
      await sleep(delayMs);
    }
  }
  throw new Error(`Failed to open OPFS db after ${attempts} attempts`);
}

/**
 * Seed baseline schema tables, users, projects, programs, scripts, and agents directly in code.
 * Zero HTTP requests, fully offline-ready, and idempotent (uses INSERT OR IGNORE).
 */
export function seedBaselineData(db: OpfsDatabase | null): void {
  if (!db) return;

  // 1. Ensure DDL tables
  db.exec(SCHEMA_DDL);

  // 2. Default user, project, conversation
  db.exec(`
    INSERT OR IGNORE INTO users (id, name, email) VALUES ('1', 'System User', 'system@local');
    INSERT OR IGNORE INTO projects (id, name, user_id) VALUES ('1', 'Keeris', '1');
    INSERT OR IGNORE INTO conversations (id, user_id, project_id) VALUES ('1', '1', '1');
  `);

  // 3. Seed programs, scripts, and agents from PROGRAM_MANIFEST
  for (const [agentId, def] of Object.entries(PROGRAM_MANIFEST)) {
    const escapedSeriesId = String(def.seriesContentId).replace(/'/g, "''");
    const escapedTitle = def.programTitle.replace(/'/g, "''");
    const scriptId = `script_${agentId}`;
    const scriptAst = JSON.stringify({
      type: 'Sequence',
      steps: [
        {
          type: 'ToolTask',
          tool: 'vikerraadio_discover_episodes',
          args: { seriesContentId: String(def.seriesContentId), limit: 50 },
          as: 'discovery',
        },
        {
          type: 'ForEach',
          collection: '{{discovery.data}}',
          iterator: 'episode',
          body: {
            type: 'ToolTask',
            tool: 'vikerraadio_process_episode',
            args: {
              url: '{{episode.url}}',
              episode: '{{episode}}',
              program: { seriesId: String(def.seriesContentId), title: def.programTitle },
            },
          },
        },
      ],
    }).replace(/'/g, "''");

    db.exec(`
      INSERT OR IGNORE INTO programs (series_id, title, created_at, updated_at)
      VALUES ('${escapedSeriesId}', '${escapedTitle}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

      INSERT OR IGNORE INTO scripts (id, name, description, ast, created_at)
      VALUES ('${scriptId}', '${escapedTitle} Workflow', 'Automated scraper for ${escapedTitle}', '${scriptAst}', CURRENT_TIMESTAMP);

      INSERT OR IGNORE INTO agents (id, name, script_id, schedule, is_active, created_at)
      VALUES ('${agentId}', '${escapedTitle}', '${scriptId}', '0 0 * * *', 0, CURRENT_TIMESTAMP);
    `);
  }

  console.log('[SQLite WASM] Baseline schema, programs, and agents verified in code.');
}

export async function initSqliteOpfs({
  seedUrl,
  dbFileName = 'keeris.sqlite3',
}: InitSqliteOptions = {}): Promise<InitSqliteResult> {
  if (dbInstance && sqlite3Instance) {
    return { sqlite3: sqlite3Instance, db: dbInstance, isOpfs: true };
  }

  sqlite3Instance = (await sqlite3InitModule({
    print: console.log,
    printErr: console.error,
  })) as unknown as Sqlite3Instance;

  console.log('[SQLite WASM] Initialized SQLite version:', sqlite3Instance.version.libVersion);

  const opfsPath = dbFileName.startsWith('/') ? dbFileName : `/${dbFileName}`;

  if (!('opfs' in sqlite3Instance)) {
    const errorMsg =
      'SQLite OPFS storage is not available in this browser context. ' +
      'OPFS strictly requires HTTPS (a Secure Context) and Cross-Origin Isolation headers (COOP: same-origin, COEP: require-corp). ' +
      'Please access the application over HTTPS.';
    console.error('[SQLite WASM]', errorMsg);
    throw new Error(errorMsg);
  }

  console.log('[SQLite WASM] Opening persistent OPFS database:', opfsPath);
  dbInstance = await openOpfsDbWithRetry(opfsPath);

  // Performance pragmas for OPFS: synchronous=NORMAL avoids blocking every write
  try {
    dbInstance.exec('PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -20000;');
  } catch (err: any) {
    console.warn('[SQLite WASM] Failed to apply performance pragmas:', err?.message);
  }

  // Ensure baseline tables and seed in code (zero network overhead, instant startup)
  seedBaselineData(dbInstance);

  // Optional: only if explicit seedUrl is provided (e.g. for external snapshot restore)
  if (seedUrl) {
    let isSeeded = false;
    try {
      const res: any[] = [];
      dbInstance.exec({ sql: 'SELECT COUNT(*) as count FROM episodes', rowMode: 'object', resultRows: res } as any);
      isSeeded = (res[0]?.count || 0) > 0;
    } catch (_) {}
    if (!isSeeded) {
      console.log(`[SQLite WASM] Restoring optional snapshot from ${seedUrl}...`);
      await rehydrateFromSeed(seedUrl, dbFileName);
    }
  }

  return { sqlite3: sqlite3Instance, db: dbInstance, isOpfs: true };
}

export function ensureBaselineTables(db: OpfsDatabase | null): void {
  if (!db) return;
  db.exec(SCHEMA_DDL);
}

export function getCurrentDb(): OpfsDatabase | null {
  return dbInstance;
}

export function isOpfsActive(): boolean {
  return true;
}

export async function rehydrateFromSeed(
  seedUrl?: string,
  dbFileName = 'keeris.sqlite3'
): Promise<boolean> {
  if (!dbInstance) {
    console.warn('[SQLite WASM] Cannot rehydrate, db not initialized');
    return false;
  }

  // If no seedUrl provided, simply re-seed in code
  if (!seedUrl) {
    console.log('[SQLite WASM] Re-seeding database in code...');
    seedBaselineData(dbInstance);
    return true;
  }

  console.log(`[SQLite WASM] Hydrating OPFS database from seed URL: ${seedUrl}...`);
  try {
    const response = await fetch(seedUrl);
    if (!response.ok) {
      console.warn(`[SQLite WASM] Seed snapshot fetch returned HTTP ${response.status}`);
      return false;
    }
    const arrayBuffer = await response.arrayBuffer();

    if (dbInstance) {
      try {
        dbInstance.close();
      } catch (_) {}
      dbInstance = null;
    }

    const opfsPath = dbFileName.startsWith('/') ? dbFileName : `/${dbFileName}`;
    await (sqlite3Instance!.oo1.OpfsDb as any).importDb(opfsPath, new Uint8Array(arrayBuffer));
    dbInstance = await openOpfsDbWithRetry(opfsPath);

    seedBaselineData(dbInstance);

    const check: any[] = [];
    dbInstance.exec({
      sql: 'SELECT COUNT(*) as count FROM unique_tracks',
      rowMode: 'object',
      resultRows: check,
    } as any);
    console.log(`[SQLite WASM] Successfully hydrated OPFS database from seed URL. Unique tracks: ${check[0]?.count || 0}`);
    return true;
  } catch (err) {
    console.error('[SQLite WASM] Rehydration failed:', err);
    return false;
  }
}

export async function resetDatabase(dbFileName = 'keeris.sqlite3'): Promise<boolean> {
  const cleanName = dbFileName.startsWith('/') ? dbFileName.slice(1) : dbFileName;
  console.log(`[SQLite WASM] Resetting database: deleting OPFS file '${cleanName}'...`);
  try {
    if (dbInstance) {
      try {
        dbInstance.close();
      } catch (_) {}
      dbInstance = null;
    }
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(cleanName);
    console.log('[SQLite WASM] OPFS database reset complete.');
    return true;
  } catch (err) {
    console.error('[SQLite WASM] Reset failed:', err);
    return false;
  }
}

export async function exportDatabaseBlob(dbFileName = 'keeris.sqlite3'): Promise<ArrayBuffer> {
  const cleanName = dbFileName.startsWith('/') ? dbFileName.slice(1) : dbFileName;
  console.log(`[SQLite WASM] Exporting OPFS database '${cleanName}'...`);
  if (dbInstance) {
    try {
      dbInstance.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (_) {}
  }

  if (sqlite3Instance && 'opfs' in sqlite3Instance && typeof navigator !== 'undefined' && (navigator.storage as any)?.getDirectory) {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(cleanName);
    const file = await fileHandle.getFile();
    return await file.arrayBuffer();
  }

  throw new Error('No active OPFS database instance available to export');
}

export async function importDatabaseFile(arrayBuffer: ArrayBuffer, dbFileName = 'keeris.sqlite3'): Promise<boolean> {
  console.log(`[SQLite WASM] Importing database (${arrayBuffer.byteLength} bytes) into OPFS '${dbFileName}'...`);
  if (!sqlite3Instance || !('opfs' in sqlite3Instance)) {
    throw new Error('SQLite WASM OPFS instance not initialized');
  }

  const opfsPath = dbFileName.startsWith('/') ? dbFileName : `/${dbFileName}`;
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (_) {}
    dbInstance = null;
  }

  await (sqlite3Instance.oo1.OpfsDb as any).importDb(opfsPath, new Uint8Array(arrayBuffer));
  dbInstance = await openOpfsDbWithRetry(opfsPath);
  seedBaselineData(dbInstance);

  console.log('[SQLite WASM] OPFS database imported successfully.');
  return true;
}
