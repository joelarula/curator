// WASM layer — bundled by Vite, so .graphql files are inlined at build time via ?raw imports.
// The ?raw suffix is a Vite built-in feature; no plugin needed.
import baseRaw from './base.graphql?raw';
import wasmRaw from './wasm.graphql?raw';

/**
 * Full SDL for the WASM/browser Web Worker layer.
 * Composed from base.graphql + wasm.graphql, inlined at build time by Vite.
 */
export const wasmTypeDefs: string = baseRaw + '\n' + wasmRaw;
export const baseTypeDefs: string = baseRaw;
