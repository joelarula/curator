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
      const { id, type, data, errors, payload, eventType, success } = event.data || {};

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
      }

      if (id && pendingRequests.has(id)) {
        const { resolve, reject } = pendingRequests.get(id);
        pendingRequests.delete(id);
        if (errors && errors.length > 0) {
          reject(new Error(errors.map(e => e.message).join(', ')));
        } else {
          resolve(data ?? payload ?? success);
        }
      }
    };
  }
  return worker;
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
    const w = getWorker();
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
    w.postMessage({ id, type: 'GRAPHQL_REQUEST', query, variables });
  });
}

/**
 * Enqueue a Curator Agent scrape job through the WASM engine.
 * This is the browser equivalent of calling triggerCuratorAgent on the server.
 * The agent is looked up from the PROGRAM_MANIFEST by name or programTitle.
 */
export function enqueueAgent(agentName, { refresh = false } = {}) {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = nextRequestId();
    pendingRequests.set(id, { resolve, reject });
    w.postMessage({ id, type: 'ENQUEUE_AGENT', agentName, refresh });
  });
}

export function rehydrateSeed() {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = nextRequestId();
    pendingRequests.set(id, { resolve: (val) => resolve(val), reject });
    w.postMessage({ id, type: 'REHYDRATE_SEED' });
  });
}

/** Delete the OPFS database file entirely. Caller should reload the page afterward. */
export function resetDatabase() {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = nextRequestId();
    pendingRequests.set(id, { resolve: (val) => resolve(val), reject });
    w.postMessage({ id, type: 'RESET_DATABASE' });
  });
}

