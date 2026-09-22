import type { AppMode, CuratorClientAdapter } from './types.ts';
import { ServerClientAdapter, getServerBaseUrl } from './server-adapter.ts';

declare const __TARGET_MODE__: string | undefined;

let activeAdapter: CuratorClientAdapter | null = null;
let detectionPromise: Promise<CuratorClientAdapter> | null = null;

/**
 * Determine the runtime application mode:
 * 0. Compile-time target mode (__TARGET_MODE__)
 * 1. Explicit query parameter (?mode=server or ?mode=wasm)
 * 2. Explicit environment variable (VITE_APP_MODE=server or VITE_APP_MODE=wasm)
 * 3. Dynamic network health probe (/health) with 1.5s timeout
 * 4. Fallback to 'wasm' for offline or static hosting
 */
export async function detectAppMode(): Promise<AppMode> {
  // 0. Compile-time target mode baked in during build
  if (typeof __TARGET_MODE__ !== 'undefined' && (__TARGET_MODE__ === 'server' || __TARGET_MODE__ === 'wasm')) {
    return __TARGET_MODE__ as AppMode;
  }

  // 1. URL Query Parameter override
  if (typeof window !== 'undefined' && window.location?.search) {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode')?.toLowerCase();
    if (modeParam === 'server' || modeParam === 'wasm') {
      console.log(`[Mode Detector] Mode explicitly set via query param: ${modeParam.toUpperCase()}`);
      return modeParam as AppMode;
    }
  }

  // 2. Vite Environment Variable override
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_MODE) {
    const envMode = String(import.meta.env.VITE_APP_MODE).toLowerCase();
    if (envMode === 'server' || envMode === 'wasm') {
      console.log(`[Mode Detector] Mode explicitly set via VITE_APP_MODE: ${envMode.toUpperCase()}`);
      return envMode as AppMode;
    }
  }

  // 3. Dynamic Network Probe (/health)
  const baseUrl = getServerBaseUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800);
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.serverApi === true || data.mode === 'express-graphql') {
        const displayTarget = baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'localhost');
        console.log(`[Mode Detector] Server backend detected at ${displayTarget}. Selected: SERVER MODE.`);
        return 'server';
      }
    }
  } catch (err: any) {
    console.log('[Mode Detector] /health check did not detect an active Node server:', err?.message);
  }

  // 4. Default Fallback
  console.log('[Mode Detector] Defaulting to WASM WORKER MODE (OPFS SQLite in-browser).');
  return 'wasm';
}

/**
 * Get or initialize the active Curator client adapter singleton.
 * Guarantees that mode detection runs only once, and that the WASM worker
 * is NEVER started when in Server mode.
 */
export async function getCuratorAdapter(): Promise<CuratorClientAdapter> {
  if (activeAdapter) return activeAdapter;

  if (typeof __TARGET_MODE__ !== 'undefined' && __TARGET_MODE__ === 'server') {
    const adapter = new ServerClientAdapter();
    await adapter.init();
    activeAdapter = adapter;
    return activeAdapter;
  }

  if (!detectionPromise) {
    detectionPromise = (async () => {
      const mode = await detectAppMode();
      if (mode === 'server') {
        const adapter = new ServerClientAdapter();
        await adapter.init();
        activeAdapter = adapter;
      } else {
        const { WasmWorkerAdapter } = await import('./wasm-adapter.ts');
        const adapter = new WasmWorkerAdapter();
        await adapter.init();
        activeAdapter = adapter;
      }
      return activeAdapter;
    })();
  }

  return detectionPromise;
}

/**
 * Synchronous accessor for currently active adapter (if initialized).
 */
export function getActiveAdapterSync(): CuratorClientAdapter | null {
  return activeAdapter;
}
