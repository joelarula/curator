/**
 * browser-node-shims.ts
 * 
 * Minimal, zero-dependency browser mocks for Node.js built-ins
 * required when bundling Curator core for browser / WASM runtimes.
 */

// ─── 'node:vm' / 'vm' ────────────────────────────────────────────────────────
export function createContext(sandbox: any = {}) {
    return sandbox;
}

export function runInContext(code: string, sandbox: any = {}) {
    const keys = Object.keys(sandbox);
    const values = Object.values(sandbox);
    const fn = new Function(...keys, `return ${code}`);
    return fn(...values);
}

// ─── 'node:fs' / 'fs' ────────────────────────────────────────────────────────
export const promises = {
    readFile: async () => '',
    writeFile: async () => {},
    mkdir: async () => {},
    access: async () => {}
};

export const existsSync = () => false;
export const readFileSync = () => '';
export const writeFileSync = () => {};
export const mkdirSync = () => {};
export const statSync = () => ({ isDirectory: () => false, isFile: () => true });

// ─── 'node:url' / 'url' ──────────────────────────────────────────────────────
export function fileURLToPath(url: any): string {
    if (typeof url === 'string') return url;
    return url?.pathname || url?.href || '';
}

export function pathToFileURL(path: string) {
    return { href: path, toString: () => path };
}

// ─── 'os' / 'node:os' ────────────────────────────────────────────────────────
export const platform = () => 'browser';
export const arch = () => 'wasm';
export const type = () => 'Browser';
export const release = () => '1.0';

// ─── 'crypto' / 'node:crypto' ────────────────────────────────────────────────
export function createHash() {
    return {
        update: () => ({
            digest: () => 'browser-mock-hash'
        })
    };
}

export function randomBytes(size: number): Uint8Array {
    const arr = new Uint8Array(size);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(arr);
    }
    return arr;
}

// ─── 'timers' / 'node:timers' ────────────────────────────────────────────────
export const setImmediate = (fn: any, ...args: any[]) => setTimeout(fn, 0, ...args);
export const clearImmediate = (id: any) => clearTimeout(id);

// ─── 'http' & 'https' ────────────────────────────────────────────────────────
export const request = () => ({
    on: () => {},
    end: () => {},
    write: () => {}
});
export const get = () => ({
    on: () => {}
});

// ─── 'dotenv' ────────────────────────────────────────────────────────────────
export const config = () => ({ parsed: {} });
export const parse = () => ({});

// Default export containing all mocks
export default {
    createContext,
    runInContext,
    promises,
    existsSync,
    readFileSync,
    writeFileSync,
    mkdirSync,
    statSync,
    fileURLToPath,
    pathToFileURL,
    platform,
    arch,
    type,
    release,
    createHash,
    randomBytes,
    setImmediate,
    clearImmediate,
    request,
    get,
    config,
    parse
};
