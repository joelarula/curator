import os from 'node:os';
import path from 'node:path';
import { createCuratorHost, type CuratorHost } from './curatorHost.js';
import { curatorEngine } from './curator.js';
import { pokerPlugin } from './plugins/pokerPlugin.ts';

export interface PokerHostOptions {
  name?: string;
  dataDir?: string;
  databasePath?: string;
  intervalMs?: number;
  quiet?: boolean;
}

/**
 * Creates and bootstraps the Curator Texas Hold'em Host runtime.
 * Provisions the SQLite database, scopes system records,
 * registers the poker plugin into CuratorEngine, and attaches CuratorRequestProcessor.
 */
export async function createPokerHost(options: PokerHostOptions = {}): Promise<CuratorHost> {
  const dbPath =
    options.databasePath ||
    process.env.CURATOR_DATABASE_PATH ||
    path.join(process.env.TEMP || os.tmpdir(), 'curator-poker.db');

  return createCuratorHost({
    name: options.name || 'poker',
    dataDir: options.dataDir ?? process.env.DATA_DIR ?? './data',
    curatorDb: {
      path: dbPath,
    },
    intervalMs: options.intervalMs ?? 500,
    logger: options.quiet
      ? { log: () => {}, info: () => {}, warn: console.warn, error: console.error }
      : {
          log: (...args: any[]) => console.log('\x1b[90m[Curator]\x1b[0m', ...args),
          info: (...args: any[]) => console.log('\x1b[90m[Curator]\x1b[0m', ...args),
          warn: console.warn,
          error: console.error,
        },
    registerPlugins: async () => {
      curatorEngine.registerPlugin(pokerPlugin);
      return curatorEngine;
    },
  });
}
