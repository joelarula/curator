/**
 * Shared base SDL — re-exported from base.graphql for use in both layers.
 * Server: loaded via readFileSync in server.ts
 * WASM:   loaded via Vite ?raw import in wasm.ts
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

export const baseTypeDefs: string = readFileSync(
  fileURLToPath(new URL('./base.graphql', import.meta.url)),
  'utf-8'
);
