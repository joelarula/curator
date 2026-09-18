/**
 * useGraphql.ts
 * 
 * Central GraphQL client and global notification layer.
 * 
 * Supports 3 runtimes transparently:
 * 1. Chrome Extension: Routes via chrome.runtime.sendMessage
 * 2. Static WASM Worker: Routes via Web Worker (curator-worker.js) + OPFS SQLite
 * 3. Server Mode: Routes via HTTP POST /graphql (with auto-fallback to WASM worker if static)
 */
import { ref } from 'vue'
import { token } from './useAuth'
import { isExtensionContext, isStaticWasmContext } from './useEnv'

export const snackbar = ref(false)
export const snackbarText = ref('')
export const snackbarTimeout = ref(3000)
export const snackbarIsError = ref(false)

function pushSnackbar(message: string, isError: boolean) {
  snackbarText.value = message
  snackbarIsError.value = isError
  snackbarTimeout.value = isError ? -1 : 3000
  snackbar.value = true
}

/** Displays a success message in the global snackbar. */
export function showSuccess(msg: string) {
  pushSnackbar(msg, false)
}

/** Displays an error message in the global snackbar (prefixed with "Error:"). */
export function showError(msg: string) {
  pushSnackbar(`Error: ${msg}`, true)
}

// ─── Web Worker Transport State ───────────────────────────────────────────────
let wasmWorker: Worker | null = null;
let reqId = 0;
const pendingWorkerRequests = new Map<string, { resolve: (res: any) => void; reject: (err: any) => void }>();
let forceWorkerMode = false;

function getWasmWorker(): Worker {
  if (!wasmWorker) {
    console.log('[GraphQL Client] Initializing Curator Web Worker...');
    const workerUrl = new URL('./curator-worker.js', window.location.href).href;
    wasmWorker = new Worker(workerUrl, { type: 'module' });

    wasmWorker.onmessage = (event) => {
      const { id, type, data, errors } = event.data || {};
      if (type === 'GRAPHQL_RESPONSE' && id && pendingWorkerRequests.has(id)) {
        const { resolve } = pendingWorkerRequests.get(id)!;
        pendingWorkerRequests.delete(id);
        resolve({ data, errors });
      }
    };

    wasmWorker.onerror = (err) => {
      console.error('[GraphQL Client] Web Worker error:', err);
    };
  }
  return wasmWorker;
}

function sendViaWorker(query: string, variables: any, activeProjectId: string): Promise<any> {
  const worker = getWasmWorker();
  const id = `req_${++reqId}`;
  return new Promise((resolve, reject) => {
    pendingWorkerRequests.set(id, { resolve, reject });
    worker.postMessage({
      id,
      type: 'GRAPHQL_REQUEST',
      payload: { query, variables, activeProjectId }
    });
  });
}

/**
 * Sends a GraphQL request using the appropriate transport for the current environment.
 * @returns The `data` field of the response, or `null` if an error occurred.
 */
export async function graphql(query: string, variables: any = {}) {
  try {
    let result: any;
    const activeProjectId = localStorage.getItem('activeProjectId') || 'system';

    if (isExtensionContext()) {
      result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'GRAPHQL_REQUEST', payload: { query, variables, activeProjectId } },
          (resp) => {
            if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
            resolve(resp);
          }
        );
      });
    } else if (forceWorkerMode || isStaticWasmContext()) {
      result = await sendViaWorker(query, variables, activeProjectId);
    } else {
      try {
        const response = await fetch('/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token.value}`,
            ...(activeProjectId && { 'x-project-id': activeProjectId }),
          },
          body: JSON.stringify({ query, variables }),
        });

        if (response.ok) {
          result = await response.json();
        } else if (response.status === 404 || response.status === 502) {
          console.warn(`[GraphQL Client] /graphql returned ${response.status}. Switching to static WASM worker mode.`);
          forceWorkerMode = true;
          result = await sendViaWorker(query, variables, activeProjectId);
        } else {
          result = await response.json().catch(() => ({ errors: [{ message: `HTTP ${response.status}` }] }));
        }
      } catch (netErr) {
        console.warn('[GraphQL Client] Network error fetching /graphql. Switching to static WASM worker mode:', netErr);
        forceWorkerMode = true;
        result = await sendViaWorker(query, variables, activeProjectId);
      }
    }

    if (result.errors) {
      console.error('GraphQL Errors:', result.errors);
      showError(result.errors[0].message);
      return null;
    }
    return result.data;
  } catch (error: any) {
    console.error('GraphQL Fetch Error:', error);
    showError(error.message || 'Network error connecting to server');
    return null;
  }
}
