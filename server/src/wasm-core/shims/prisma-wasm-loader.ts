// Universal WASM loader for Prisma query engine
// Supports both Chrome Extension environment and Standard Web Worker / Browser environments.

function getWasmUrl(): string {
    if (typeof (globalThis as any).chrome !== 'undefined' && (globalThis as any).chrome.runtime?.getURL) {
        return (globalThis as any).chrome.runtime.getURL('dist/query_compiler_fast_bg.wasm');
    }
    // Standard web worker context
    try {
        return new URL('./query_compiler_fast_bg.wasm', import.meta.url).href;
    } catch {
        return './query_compiler_fast_bg.wasm';
    }
}

const wasmUrl = getWasmUrl();
console.log('[Curator WASM Loader] Fetching Prisma engine from:', wasmUrl);

const wasmModulePromise = fetch(wasmUrl)
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to fetch query engine WASM: ${response.statusText} (${response.status})`);
        }
        return response.arrayBuffer();
    })
    .then(bytes => {
        console.log('[Curator WASM Loader] Prisma WASM bytes fetched. Compiling WebAssembly module...');
        return WebAssembly.compile(bytes);
    })
    .catch(err => {
        console.error('[Curator WASM Loader] Prisma WASM compilation failed:', err);
        throw err;
    });

const loaderPromise: any = wasmModulePromise.then(wasmModule => {
    return {
        default: wasmModule
    };
});

loaderPromise.getQueryCompilerWasmModule = async () => {
    return await wasmModulePromise;
};

export default loaderPromise;
