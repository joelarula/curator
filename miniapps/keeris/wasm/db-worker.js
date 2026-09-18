import { initSqliteOpfs, rehydrateFromSeed, getCurrentDb, resetDatabase, exportDatabaseBlob, importDatabaseFile } from './sqlite-opfs.js';
import { executeInWorkerGraphql } from './graphql-schema.js';
import { startWasmRequestProcessor, enqueueScrapeRequest, resolveAgentByTitle, PROGRAM_MANIFEST, setWasmEnginePaused } from './wasm-curator-engine.js';

let dbInstance = null;
let processorInstance = null;
let bootstrapPromise = null;

let dbChangeDebounceTimer = null;
const pendingChangedTables = new Set();

/**
 * Emit a debounced database mutation event to the main UI thread.
 * This notifies Vue views to reactively refresh their data without blind polling.
 */
function emitDatabaseChange(tables = ['all']) {
  tables.forEach(t => pendingChangedTables.add(t));
  if (dbChangeDebounceTimer) return;
  dbChangeDebounceTimer = setTimeout(() => {
    dbChangeDebounceTimer = null;
    const tableList = Array.from(pendingChangedTables);
    pendingChangedTables.clear();
    console.log(`%c[db-worker TX ⬅] %cDATABASE_CHANGED`, 'color: #10b981; font-weight: bold;', 'color: #94a3b8;', tableList);
    self.postMessage({ type: 'DATABASE_CHANGED', tables: tableList, timestamp: Date.now() });
  }, 300);
}

/**
 * Emit an agent progress event back to the main thread.
 * The graphql-client.js listens for AGENT_PROGRESS messages
 * and broadcasts them to Vue components.
 */
function emitProgress(eventType, payload) {
  console.log(`%c[db-worker TX ⬅] %cAGENT_PROGRESS:${eventType}`, 'color: #38bdf8; font-weight: bold;', 'color: #cbd5e1;', payload);
  self.postMessage({ type: 'AGENT_PROGRESS', eventType, payload });

  // Push DB invalidation to the UI on data commits
  if (eventType === 'episode') {
    emitDatabaseChange(['episodes', 'tracks', 'unique_tracks', 'stats']);
  } else if (eventType === 'done' || eventType === 'complete') {
    emitDatabaseChange(['episodes', 'tracks', 'unique_tracks', 'stats', 'agents', 'all']);
  } else if (eventType === 'request_start' || eventType === 'request_done') {
    emitDatabaseChange(['requests', 'responses']);
  }
}

async function bootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        console.log('[Web Worker] Bootstrapping SQLite OPFS & Curator Engine...');
        const { sqlite3, db } = await initSqliteOpfs();
        dbInstance = db;

        // Start the Curator Engine request processor
        processorInstance = startWasmRequestProcessor(dbInstance, {
          intervalMs: 1500,
          onProgress: emitProgress,
        });

        const isOpfs = 'opfs' in sqlite3;
        console.log(`[Web Worker] SQLite Storage Mode: ${isOpfs ? 'Persistent OPFS (Disk)' : 'Transient Memory (RAM)'}`);

        // Expose debug utilities on self for developer console inspection
        self.__debug = {
          getDb: () => dbInstance,
          query: (sql, params = []) => {
            const rows = [];
            dbInstance.exec({ sql, bind: params, rowMode: 'object', resultRows: rows });
            console.table(rows);
            return rows;
          },
          processor: () => processorInstance,
          manifest: PROGRAM_MANIFEST,
        };
        console.log('%c[Web Worker] Debug console ready! Switch console context to worker and run: %c__debug.query("SELECT * FROM episodes LIMIT 5")', 'color: #38bdf8;', 'color: #f59e0b; font-weight: bold;');

        self.postMessage({ type: 'READY', payload: { version: sqlite3.version.libVersion, isOpfs } });
        return dbInstance;
      } catch (error) {
        console.error('[Web Worker] Initialization failed:', error);
        self.postMessage({ type: 'ERROR', payload: { message: error.message } });
        throw error;
      }
    })();
  }
  return bootstrapPromise;
}

self.onmessage = async (event) => {
  const { id, type, query, variables, agentName, refresh } = event.data || {};
  console.log(`%c[db-worker RX ➔] %c${type || 'UNKNOWN'}`, 'color: #a855f7; font-weight: bold;', 'color: #cbd5e1;', event.data);

  if (type === 'GRAPHQL_REQUEST') {
    try {
      const db = await bootstrap();
      const result = await executeInWorkerGraphql(db, query, variables);
      self.postMessage({ id, type: 'GRAPHQL_RESPONSE', data: result.data, errors: result.errors });
      if (query && typeof query === 'string' && query.trim().startsWith('mutation')) {
        emitDatabaseChange(['mutations', 'all']);
      }
    } catch (err) {
      self.postMessage({ id, type: 'GRAPHQL_RESPONSE', errors: [{ message: err.message }] });
    }
  }

  if (type === 'ENQUEUE_AGENT') {
    try {
      const db = await bootstrap();
      const enqueued = enqueueScrapeRequest(db, agentName, refresh === true);
      self.postMessage({ id, type: 'AGENT_ENQUEUED', payload: enqueued });
      emitProgress('log', '[Worker] Enqueued scrape for: ' + enqueued.programTitle);
    } catch (err) {
      self.postMessage({ id, type: 'AGENT_ENQUEUED', error: err.message });
      emitProgress('error', '[Worker] Failed to enqueue: ' + err.message);
    }
  }

  if (type === 'REHYDRATE_SEED') {
    await bootstrap();
    const success = await rehydrateFromSeed();
    if (success) {
      // rehydrateFromSeed closes the old connection and opens a new one; the
      // running processor's closure still points at the closed handle, so
      // restart it against the fresh db to avoid SQLITE_CANTOPEN on the next tick.
      processorInstance?.stop();
      dbInstance = getCurrentDb();
      processorInstance = startWasmRequestProcessor(dbInstance, {
        intervalMs: 1500,
        onProgress: emitProgress,
      });
      emitDatabaseChange(['all', 'stats', 'episodes', 'tracks', 'unique_tracks']);
    }
    self.postMessage({ id, type: 'REHYDRATE_RESPONSE', success });
  }

  if (type === 'RESET_DATABASE') {
    await bootstrap();
    processorInstance?.stop();
    const success = await resetDatabase();
    if (success) {
      emitDatabaseChange(['all', 'stats', 'episodes', 'tracks', 'unique_tracks']);
    }
    self.postMessage({ id, type: 'RESET_RESPONSE', success });
  }

  if (type === 'EXPORT_DATABASE') {
    await bootstrap();
    try {
      const arrayBuffer = await exportDatabaseBlob();
      self.postMessage({ id, type: 'EXPORT_RESPONSE', payload: arrayBuffer }, [arrayBuffer]);
    } catch (err) {
      self.postMessage({ id, type: 'ERROR', payload: { message: err.message } });
    }
  }

  if (type === 'IMPORT_DATABASE') {
    await bootstrap();
    processorInstance?.stop();
    try {
      const success = await importDatabaseFile(payload.arrayBuffer);
      dbInstance = getCurrentDb();
      processorInstance = startWasmRequestProcessor(dbInstance, {
        intervalMs: 1500,
        onProgress: emitProgress,
      });
      if (success) {
        emitDatabaseChange(['all', 'stats', 'episodes', 'tracks', 'unique_tracks']);
      }
      self.postMessage({ id, type: 'IMPORT_RESPONSE', success });
    } catch (err) {
      self.postMessage({ id, type: 'ERROR', payload: { message: err.message } });
    }
  }

  if (type === 'GET_STORAGE_INFO') {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      self.postMessage({ id, type: 'STORAGE_INFO', payload: estimate });
    } else {
      self.postMessage({ id, type: 'STORAGE_INFO', payload: { usage: 0, quota: 0 } });
    }
  }

  if (type === 'GET_AGENT_MANIFEST') {
    self.postMessage({ id, type: 'AGENT_MANIFEST', payload: PROGRAM_MANIFEST });
  }

  if (type === 'TOGGLE_PAUSE_PROCESSOR') {
    await bootstrap();
    const currentlyPaused = processorInstance?.isPaused() || false;
    const newPaused = !currentlyPaused;
    if (newPaused) {
      processorInstance?.pause();
      setWasmEnginePaused(true);
      emitProgress('log', '[CuratorEngine] Processing paused.');
    } else {
      processorInstance?.resume();
      setWasmEnginePaused(false);
      emitProgress('log', '[CuratorEngine] Processing resumed.');
    }
    self.postMessage({ id, type: 'PAUSE_STATE', isPaused: newPaused });
  }

  if (type === 'GET_PROCESSOR_STATE') {
    await bootstrap();
    const isPaused = processorInstance?.isPaused() || false;
    self.postMessage({ id, type: 'PROCESSOR_STATE', isPaused });
  }

  if (type === 'PAUSE_REQUEST') {
    await bootstrap();
    const { requestId } = event.data || {};
    processorInstance?.pauseRequest(requestId);
    self.postMessage({ id, type: 'PAUSE_REQUEST_RESULT', success: true });
  }

  if (type === 'RESUME_REQUEST') {
    await bootstrap();
    const { requestId } = event.data || {};
    processorInstance?.resumeRequest(requestId);
    self.postMessage({ id, type: 'RESUME_REQUEST_RESULT', success: true });
  }
};

bootstrap();
