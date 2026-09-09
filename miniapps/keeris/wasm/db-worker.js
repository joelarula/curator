import { initSqliteOpfs, rehydrateFromSeed, getCurrentDb, resetDatabase } from './sqlite-opfs.js';
import { executeInWorkerGraphql } from './graphql-schema.js';
import { startWasmRequestProcessor, enqueueScrapeRequest, resolveAgentByTitle, PROGRAM_MANIFEST } from './wasm-curator-engine.js';

let dbInstance = null;
let processorInstance = null;
let bootstrapPromise = null;

/**
 * Emit an agent progress event back to the main thread.
 * The graphql-client.js listens for AGENT_PROGRESS messages
 * and broadcasts them to Vue components.
 */
function emitProgress(eventType, payload) {
  self.postMessage({ type: 'AGENT_PROGRESS', eventType, payload });
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

        self.postMessage({ type: 'READY', payload: { version: sqlite3.version.libVersion } });
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

  if (type === 'GRAPHQL_REQUEST') {
    try {
      const db = await bootstrap();
      const result = await executeInWorkerGraphql(db, query, variables);
      self.postMessage({ id, type: 'GRAPHQL_RESPONSE', data: result.data, errors: result.errors });
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
    }
    self.postMessage({ id, type: 'REHYDRATE_RESPONSE', success });
  }

  if (type === 'RESET_DATABASE') {
    await bootstrap();
    processorInstance?.stop();
    const success = await resetDatabase();
    self.postMessage({ id, type: 'RESET_RESPONSE', success });
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
};

bootstrap();
