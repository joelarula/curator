import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const read = (file: string) =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf-8');

/**
 * Full SDL for the Node.js server layer.
 * Composed from base.graphql + server.graphql at startup via readFileSync.
 */
export const serverTypeDefs: string = read('./base.graphql') + '\n' + read('./server.graphql');
