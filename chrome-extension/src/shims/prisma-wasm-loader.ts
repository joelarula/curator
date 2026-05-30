// Custom WASM loader for Prisma query engine running inside Chrome Extension background worker
// This avoids restrictive Content Security Policy (CSP) data-url dynamic import errors.

const wasmUrl = chrome.runtime.getURL('dist/query_compiler_fast_bg.wasm');

console.log('[Curator Extension] Prisma WASM Loader fetching engine from:', wasmUrl);

const wasmModulePromise = fetch(wasmUrl)
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to fetch query engine WASM: ${response.statusText}`);
        }
        return response.arrayBuffer();
    })
    .then(bytes => {
        console.log('[Curator Extension] Prisma WASM bytes fetched successfully. Compiling engine...');
        return WebAssembly.compile(bytes);
    })
    .catch(err => {
        console.error('[Curator Extension] Prisma WASM compilation failed:', err);
        throw err;
    });

// The generated loader (in @prisma/client/wasm edge runtime) expects:
//   const loader = (await import('#wasm-compiler-loader')).default
//   const compiler = (await loader).default
//   return compiler
// So the default export must be a Promise that resolves to an object with a `.default` property,
// which contains the compiled WebAssembly.Module.
const loaderPromise: any = wasmModulePromise.then(wasmModule => {
    return {
        default: wasmModule
    };
});

// For backward compatibility or direct calls:
loaderPromise.getQueryCompilerWasmModule = async () => {
    return await wasmModulePromise;
};

export default loaderPromise;
