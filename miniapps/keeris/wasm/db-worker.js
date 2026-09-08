import { initSqliteOpfs, rehydrateFromSeed } from './sqlite-opfs.js';
import { executeInWorkerGraphql } from './graphql-schema.js';
import { startInWorkerCuratorRunner } from './curator-ast-runner.js';

let dbInstance = null;
let runnerInstance = null;
let bootstrapPromise = null;

async function bootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        console.log('[Web Worker] Bootstrapping SQLite OPFS & Curator Engine...');
        const { sqlite3, db } = await initSqliteOpfs();
        dbInstance = db;

        runnerInstance = startInWorkerCuratorRunner(dbInstance);

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
  const { id, type, query, variables } = event.data || {};

  if (type === 'GRAPHQL_REQUEST') {
    try {
      const db = await bootstrap();
      const result = await executeInWorkerGraphql(db, query, variables);
      self.postMessage({ id, type: 'GRAPHQL_RESPONSE', data: result.data, errors: result.errors });
    } catch (err) {
      self.postMessage({ id, type: 'GRAPHQL_RESPONSE', errors: [{ message: err.message }] });
    }
  }

  if (type === 'REHYDRATE_SEED') {
    await bootstrap();
    const success = await rehydrateFromSeed();
    self.postMessage({ id, type: 'REHYDRATE_RESPONSE', success });
  }

  if (type === 'GET_STORAGE_INFO') {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      self.postMessage({ id, type: 'STORAGE_INFO', payload: estimate });
    } else {
      self.postMessage({ id, type: 'STORAGE_INFO', payload: { usage: 0, quota: 0 } });
    }
  }
};

bootstrap();
