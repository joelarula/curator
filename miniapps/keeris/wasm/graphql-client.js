let worker = null;
let isReady = false;
const pendingRequests = new Map();
const readyListeners = [];
const progressListeners = new Set();
let isServerMode = null;
let requestIdCounter = 0;
function nextRequestId() { return String(++requestIdCounter); }

async function checkServerMode() {
  if (isServerMode !== null) return isServerMode;
  try {
    const res = await fetch('/health');
    if (res.ok) {
      const data = await res.json();
      if (data.serverApi === true || data.mode === 'express-graphql') {
        isServerMode = true;
        isReady = true;
        console.log('[GraphQL Client] Mode: SERVER (Express + Prisma via /graphql). WASM worker will NOT be used.');
        readyListeners.forEach((fn) => fn({ mode: 'server' }));
        readyListeners.length = 0;
        return true;
      }
    }
  } catch (err) {
    console.log('[GraphQL Client] /health check failed, assuming no server backend:', err.message);
  }
  isServerMode = false;
  console.log('[GraphQL Client] Mode: WASM WORKER (OPFS SQLite in-browser).');
  return false;
}

export function getWorker() {
  if (!worker) {
    console.log('[GraphQL Client] Initializing Web Worker instance...');
    worker = new Worker(new URL('./db-worker.js', import.meta.url), { type: 'module' });

    worker.onerror = (event) => {
      console.error('[GraphQL Client] Uncaught worker error:', event.message, event);
      progressListeners.forEach((fn) => fn('error', '[Worker] Uncaught error: ' + event.message));
    };

    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(granted => {
        console.log('[Storage Quota] Persistent OPFS disk storage: ' + (granted ? 'Granted' : 'Default'));
      });
    }

    worker.onmessage = (event) => {
      const { id, type, data, errors, payload, eventType, success, isPaused } = event.data || {};
      console.log(`%c[Worker RX ⬅] %c${type || 'MESSAGE'}`, 'color: #34d399; font-weight: bold;', 'color: #cbd5e1;', event.data);
      progressListeners.forEach((fn) => fn('postmessage_rx', event.data));

      if (type === 'READY') {
        console.log('[GraphQL Client] Worker DB & Curator Engine Ready!');
        isReady = true;
        readyListeners.forEach((fn) => fn(payload));
        readyListeners.length = 0;
      }

      // Worker bootstrap failed (e.g. OPFS open error) - surface it, don't fail silently
      if (type === 'ERROR') {
        console.error('[GraphQL Client] Worker reported a fatal error:', payload?.message);
        progressListeners.forEach((fn) => fn('error', '[Worker] ' + (payload?.message || 'Unknown worker error')));
        for (const [reqId, { reject }] of pendingRequests) {
          reject(new Error(payload?.message || 'Worker initialization failed'));
        }
        pendingRequests.clear();
      }

      // Broadcast agent progress events to all Vue subscribers
      if (type === 'AGENT_PROGRESS') {
        progressListeners.forEach((fn) => fn(eventType, payload));
        if (eventType === 'episode' || eventType === 'done' || eventType === 'complete' || eventType === 'request_done') {
          notifyDatabaseChange(['episodes', 'tracks', 'stats']);
        }
      }

      // Broadcast live database mutation push from worker thread to reactive UI views
      if (type === 'DATABASE_CHANGED') {
        notifyDatabaseChange(event.data?.tables || payload?.tables || ['all']);
      }

      if (id && pendingRequests.has(id)) {
        const { resolve, reject } = pendingRequests.get(id);
        pendingRequests.delete(id);
        if (errors && errors.length > 0) {
          reject(new Error(errors.map(e => e.message).join(', ')));
        } else {
          const resVal = isPaused !== undefined ? isPaused : (data ?? payload ?? success);
          resolve(resVal);
        }
      }
    };
  }
  return worker;
}

/** Send message to Web Worker with formatted console logging and progress broadcast. */
export function sendWorkerMessage(message, transferList) {
  const w = getWorker();
  console.log(`%c[Worker TX ➔] %c${message.type || 'MESSAGE'}`, 'color: #38bdf8; font-weight: bold;', 'color: #cbd5e1;', message);
  progressListeners.forEach((fn) => fn('postmessage_tx', message));
  if (transferList) {
    w.postMessage(message, transferList);
  } else {
    w.postMessage(message);
  }
}

/** Toggle pause/resume state on the Curator WASM RequestProcessor. */
export function toggleProcessorPause() {
  return new Promise((resolve, reject) => {
    const id = nextRequestId();
    pendingRequests.set(id, { resolve, reject });
    sendWorkerMessage({ id, type: 'TOGGLE_PAUSE_PROCESSOR' });
  });
}

/** Get current pause state of the Curator WASM RequestProcessor. */
export function getProcessorState() {
  return new Promise((resolve, reject) => {
    const id = nextRequestId();
    pendingRequests.set(id, { resolve, reject });
    sendWorkerMessage({ id, type: 'GET_PROCESSOR_STATE' });
  });
}

/** Pause an individual Curator Request by ID */
export function pauseRequest(requestId) {
  return new Promise((resolve, reject) => {
    const id = nextRequestId();
    pendingRequests.set(id, { resolve, reject });
    sendWorkerMessage({ id, type: 'PAUSE_REQUEST', requestId });
  });
}

/** Resume an individual paused Curator Request by ID */
export function resumeRequest(requestId) {
  return new Promise((resolve, reject) => {
    const id = nextRequestId();
    pendingRequests.set(id, { resolve, reject });
    sendWorkerMessage({ id, type: 'RESUME_REQUEST', requestId });
  });
}

/** Subscribe to agent progress events emitted by the Curator WASM Engine. */
export function onAgentProgress(callback) {
  progressListeners.add(callback);
  return () => progressListeners.delete(callback);
}

export async function onWorkerReady(callback) {
  const isServer = await checkServerMode();
  if (isServer || isReady) {
    callback();
  } else {
    readyListeners.push(callback);
    getWorker();
  }
}

export async function requestGraphql(query, variables = {}) {
  const isServer = await checkServerMode();
  if (isServer) {
    try {
      const res = await fetch('/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload.errors?.length) throw new Error(payload.errors[0].message);
        return payload.data;
      }
    } catch (err) {
      console.warn('[GraphQL Client] Server request failed, fallback to WASM worker:', err);
    }
  }

  return new Promise((resolve, reject) => {
    const id = nextRequestId();
    const timeoutMs = 30000;
    const timer = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`GraphQL request timed out after ${timeoutMs / 1000}s (worker may be busy with a long-running scrape)`));
      }
    }, timeoutMs);
    pendingRequests.set(id, {
      resolve: (val) => { clearTimeout(timer); resolve(val); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });
    sendWorkerMessage({ id, type: 'GRAPHQL_REQUEST', query, variables });
  });
}

/**
 * Enqueue a Curator Agent scrape job through the WASM engine.
 * This is the browser equivalent of calling triggerCuratorAgent on the server.
 * The agent is looked up from the PROGRAM_MANIFEST by name or programTitle.
 */
export function enqueueAgent(agentName, { refresh = false } = {}) {
  return new Promise((resolve, reject) => {
    const id = nextRequestId();
    pendingRequests.set(id, { resolve, reject });
    sendWorkerMessage({ id, type: 'ENQUEUE_AGENT', agentName, refresh });
  });
}

export function rehydrateSeed() {
  return new Promise((resolve, reject) => {
    const id = nextRequestId();
    pendingRequests.set(id, { resolve: (val) => resolve(val), reject });
    sendWorkerMessage({ id, type: 'REHYDRATE_SEED' });
  });
}

/** Delete the OPFS database file entirely. Caller should reload the page afterward. */
export function resetDatabase() {
  return new Promise((resolve, reject) => {
    const id = nextRequestId();
    pendingRequests.set(id, { resolve: (val) => resolve(val), reject });
    sendWorkerMessage({ id, type: 'RESET_DATABASE' });
  });
}

/** Download the OPFS SQLite database as a .sqlite3 file. */
export async function exportDatabase() {
  const id = nextRequestId();
  const arrayBuffer = await new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    sendWorkerMessage({ id, type: 'EXPORT_DATABASE' });
  });

  const blob = new Blob([arrayBuffer], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `keeris-backup-${dateStr}.sqlite3`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

/** Import a user-selected .sqlite/.sqlite3/.db File directly into OPFS and reload. */
export async function importDatabase(file) {
  const arrayBuffer = await file.arrayBuffer();
  const id = nextRequestId();
  await new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    sendWorkerMessage({ id, type: 'IMPORT_DATABASE', payload: { arrayBuffer } }, [arrayBuffer]);
  });
  return true;
}

const dbChangeListeners = new Set();

/**
 * Subscribe to real-time database invalidation events pushed from the worker thread.
 * Fired whenever the scraper commits episodes/tracks or GraphQL mutations execute.
 * @param {Function} callback - ({ tables, timestamp }) => void
 * @returns {Function} unsubscribe function
 */
export function onDatabaseChange(callback) {
  dbChangeListeners.add(callback);
  return () => dbChangeListeners.delete(callback);
}

/**
 * Dispatch database invalidation to all subscribed Vue views.
 */
export function notifyDatabaseChange(tables = []) {
  const payload = { tables: Array.isArray(tables) ? tables : [tables], timestamp: Date.now() };
  dbChangeListeners.forEach((fn) => {
    try {
      fn(payload);
    } catch (err) {
      console.error('[GraphQL Client] Error in onDatabaseChange listener:', err);
    }
  });
}


