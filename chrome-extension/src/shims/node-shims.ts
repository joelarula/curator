// Web-compatible shims for Node-specific modules

// 'url' and 'node:url'
export function fileURLToPath(url: any) {
    if (typeof url === 'string') return url;
    return url.pathname || url.href || '';
}
export function pathToFileURL(path: any) {
    return { href: path, toString: () => path };
}

// 'timers'
export const setImmediate = (fn: any, ...args: any[]) => setTimeout(fn, 0, ...args);
export const clearImmediate = (id: any) => clearTimeout(id);

// 'crypto'
export function createHash() {
    return {
        update: () => ({
            digest: () => 'mock-hash'
        })
    };
}
export function randomBytes(size: number) {
    const arr = new Uint8Array(size);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(arr);
    }
    return arr;
}

// 'os'
export const platform = () => 'browser';
export const arch = () => 'wasm';
export const type = () => 'Browser';
export const release = () => '1.0';

// 'dotenv'
export const config = () => ({ parsed: {} });
export const parse = () => ({});

// 'http' & 'https'
export const request = () => ({
    on: () => {},
    end: () => {},
    write: () => {}
});
export const get = () => ({
    on: () => {}
});

// 'child_process'
export const execSync = () => '';
export const spawn = () => ({
    on: () => {},
    stdout: { on: () => {} },
    stderr: { on: () => {} }
});

// 'net' & 'tls'
export const connect = () => ({});
export const createServer = () => ({});

// 'stream'
export class Stream {
    static Readable = class {};
    static Writable = class {};
    static Transform = class {};
    on() {}
    once() {}
    emit() {}
}

// 'string_decoder'
export class StringDecoder {
    write(buf: any) { return ''; }
    end() { return ''; }
}

// Default export containing all shims
export default {
    fileURLToPath,
    pathToFileURL,
    setImmediate,
    clearImmediate,
    createHash,
    randomBytes,
    platform,
    arch,
    type,
    release,
    config,
    parse,
    request,
    get,
    execSync,
    spawn,
    connect,
    createServer,
    Stream,
    StringDecoder
};
