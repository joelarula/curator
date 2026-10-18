import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCuratorHost, type CuratorHost } from './curatorHost.ts';
import { curatorEngine } from './curator.ts';
import { pokerPlugin } from './plugins/pokerPlugin.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_POKER_DB = path.resolve(__dirname, '../data/poker.db');

export interface PokerHostOptions {
  name?: string;
  projectId?: string;
  projectName?: string;
  autoSeed?: boolean;
  forceReset?: boolean;
  dataDir?: string;
  databasePath?: string;
  intervalMs?: number;
  quiet?: boolean;
  userId?: string;
  userName?: string;
  userEmail?: string;
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
    DEFAULT_POKER_DB;

  return createCuratorHost({
    name: options.name || 'poker',
    projectId: options.projectId || 'poker-project-1',
    projectName: options.projectName || 'Texas Holdem Lounge',
    ...(options.userId ? { userId: options.userId } : {}),
    ...(options.userName ? { userName: options.userName } : {}),
    ...(options.userEmail ? { userEmail: options.userEmail } : {}),
    ...(options.autoSeed !== undefined ? { autoSeed: options.autoSeed } : {}),
    ...(options.forceReset !== undefined ? { forceReset: options.forceReset } : {}),
    ...(options.dataDir ? { dataDir: options.dataDir } : {}),
    curatorDb: {
      path: dbPath,
    },
    ...(options.intervalMs !== undefined ? { intervalMs: options.intervalMs } : {}),
    logger: options.quiet
      ? { log: () => { }, info: () => { }, warn: console.warn, error: console.error }
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
