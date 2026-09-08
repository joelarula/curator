let worker = null;
let isReady = false;
const pendingRequests = new Map();
const readyListeners = [];
let isServerMode = null;

async function checkServerMode() {
  if (isServerMode !== null) return isServerMode;
  try {
    const res = await fetch('/health');
    if (res.ok) {
      isServerMode = true;
      isReady = true;
      readyListeners.forEach((fn) => fn({ mode: 'server' }));
      readyListeners.length = 0;
      return true;
    }
  } catch (_) {}
  isServerMode = false;
  return false;
}

export function getWorker() {
  if (!worker) {
    console.log('[GraphQL Client] Initializing Web Worker instance...');
    worker = new Worker(new URL('./db-worker.js', import.meta.url), { type: 'module' });

    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(granted => {
        console.log(`[Storage Quota] Persistent OPFS disk storage: ${granted ? 'Granted' : 'Default'}`);
      });
    }

    worker.onmessage = (event) => {
      const { id, type, data, errors, payload } = event.data || {};

      if (type === 'READY') {
        console.log('[GraphQL Client] Worker DB & Curator Engine Ready!');
        isReady = true;
        readyListeners.forEach((fn) => fn(payload));
        readyListeners.length = 0;
      }

      if (id && pendingRequests.has(id)) {
        const { resolve, reject } = pendingRequests.get(id);
        pendingRequests.delete(id);
        if (errors && errors.length > 0) {
          reject(new Error(errors.map(e => e.message).join(', ')));
        } else {
          resolve(data);
        }
      }
    };
  }
  return worker;
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
  } catch (_) {}

  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = `req-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    pendingRequests.set(id, { resolve, reject });
    w.postMessage({ id, type: 'GRAPHQL_REQUEST', query, variables });
  });
}

export function rehydrateSeed() {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = `req-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    pendingRequests.set(id, { resolve: (val) => resolve(val), reject });
    w.postMessage({ id, type: 'REHYDRATE_SEED' });
  });
}
