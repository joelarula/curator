import initSqlJs from 'sql.js';
import { CuratorWasmCore } from '../../../server/src/wasm-core/index.js';

let core = new CuratorWasmCore();
let db: any = null;
let isBooting = false;
let bootPromise: Promise<void> | null = null;

const DB_FILENAME = 'curator.sqlite3';
const SEED_URL = './data/curator.db';

// Direct OPFS (Origin Private File System) Persistence
async function saveToOpfs(filename: string, bytes: Uint8Array): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
        try {
            const root = await navigator.storage.getDirectory();
            const fileHandle = await root.getFileHandle(filename, { create: true });
            const writable = await (fileHandle as any).createWritable();
            await writable.write(bytes);
            await writable.close();
            console.log(`[Curator Worker] Persisted ${bytes.byteLength} bytes directly to OPFS (/${filename})`);
        } catch (err) {
            console.warn('[Curator Worker] OPFS write warning:', err);
        }
    }
}

async function loadFromOpfs(filename: string): Promise<Uint8Array | null> {
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
        try {
            const root = await navigator.storage.getDirectory();
            const fileHandle = await root.getFileHandle(filename);
            const file = await fileHandle.getFile();
            const buffer = await file.arrayBuffer();
            if (buffer.byteLength > 0) {
                console.log(`[Curator Worker] Restored ${buffer.byteLength} bytes from OPFS (/${filename})`);
                return new Uint8Array(buffer);
            }
        } catch {
            // File does not exist yet
        }
    }
    return null;
}

async function fetchStaticSeed(url: string): Promise<Uint8Array | null> {
    try {
        const res = await fetch(url);
        if (res.ok) {
            const buffer = await res.arrayBuffer();
            if (buffer.byteLength > 0) {
                console.log(`[Curator Worker] Loaded pre-seeded database from static server: ${url}`);
                return new Uint8Array(buffer);
            }
        }
    } catch {
        // No static seed on server
    }
    return null;
}

async function persistCurrentState() {
    if (core) {
        const bytes = core.exportDatabase();
        if (bytes) {
            await saveToOpfs(DB_FILENAME, bytes);
        }
    }
}

async function bootstrap(): Promise<void> {
    if (bootPromise) return bootPromise;

    bootPromise = (async () => {
        console.log('[Curator Worker] Initializing SQLite WASM runtime...');

        // 1. Fetch sql-wasm.wasm
        const wasmUrl = new URL('./sql-wasm.wasm', import.meta.url).href;
        const wasmRes = await fetch(wasmUrl);
        if (!wasmRes.ok) {
            throw new Error(`Failed to load sql-wasm.wasm from ${wasmUrl}`);
        }
        const wasmBinary = await wasmRes.arrayBuffer();

        const SQL = await initSqlJs({ wasmBinary });

        // 2. Try loading from OPFS first, then fallback to static seed, else create fresh
        let initialBytes = await loadFromOpfs(DB_FILENAME);
        if (!initialBytes) {
            initialBytes = await fetchStaticSeed(SEED_URL);
        }

        if (initialBytes) {
            db = new SQL.Database(initialBytes);
            console.log('[Curator Worker] SQLite database opened from existing snapshot.');
        } else {
            db = new SQL.Database();
            console.log('[Curator Worker] Initialized fresh in-memory SQLite database.');
        }

        // 3. Initialize Curator WASM Core
        await core.init({
            db,
            defaultUserId: 'curator-static-user',
            defaultProjectId: 'system',
            onPersist: persistCurrentState,
            onLog: (level, type, message, detail) => {
                console.log(`[Curator Worker][${level}][${type}] ${message}`, detail || '');
                (self as any).postMessage({
                    type: 'LOG_EVENT',
                    level,
                    eventType: type,
                    message,
                    detail
                });
            }
        });

        // Ensure state is saved to OPFS
        await persistCurrentState();

        console.log('[Curator Worker] Ready to handle GraphQL requests.');
        (self as any).postMessage({ type: 'WORKER_READY', payload: { db: DB_FILENAME } });
    })();

    return bootPromise;
}

// Start booting immediately
bootstrap().catch(err => {
    console.error('[Curator Worker] Bootstrap failed:', err);
    (self as any).postMessage({ type: 'WORKER_ERROR', error: err.message });
});

(self as any).onmessage = async (event: MessageEvent) => {
    const { id, type, payload } = event.data || {};

    if (type === 'GRAPHQL_REQUEST') {
        try {
            await bootstrap();
            const { query, variables, activeProjectId, userId } = payload || {};
            const result = await core.handleGraphQL({
                query,
                variables,
                activeProjectId,
                userId
            });
            (self as any).postMessage({
                id,
                type: 'GRAPHQL_RESPONSE',
                data: result.data,
                errors: result.errors
            });
        } catch (err: any) {
            (self as any).postMessage({
                id,
                type: 'GRAPHQL_RESPONSE',
                errors: [{ message: err.message }]
            });
        }
    } else if (type === 'EXPORT_DATABASE') {
        try {
            await bootstrap();
            const bytes = core.exportDatabase();
            (self as any).postMessage({
                id,
                type: 'EXPORT_RESPONSE',
                payload: bytes
            });
        } catch (err: any) {
            (self as any).postMessage({
                id,
                type: 'EXPORT_RESPONSE',
                error: err.message
            });
        }
    } else if (type === 'GET_STATUS') {
        (self as any).postMessage({
            id,
            type: 'STATUS_RESPONSE',
            payload: {
                ready: db !== null,
                activeProjectId: core.getActiveProjectId()
            }
        });
    }
};
