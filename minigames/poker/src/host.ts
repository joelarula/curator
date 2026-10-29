import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCuratorHost, type CuratorHost } from './curatorHost.ts';
import { curatorEngine, LlmFactory } from './curator.ts';
import { pokerPlugin } from './plugins/pokerPlugin.ts';
import { geminiPlugin } from '@curator/plugin-llm-gemini';
import { getGeminiApiKey, loadPokerConfigFile } from './env.ts';
import { resolvePokerConfig, POKER_CONFIG_NAMESPACE, type PokerConfig } from './pokerConfig.ts';

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
  logLevel?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  enableGemini?: boolean;
  apiKey?: string;
  llmProvider?: any;
  /** Path of the poker config file (default: `POKER_CONFIG`, then `poker.config.json` in cwd or the module root). */
  configPath?: string;
  /** Settings layered over the config file (`talk`, `agents`). */
  config?: PokerConfig;
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

  // What workflows read as `$config.poker`: the config file, then these options, over the defaults
  const pokerConfig = resolvePokerConfig(loadPokerConfigFile(options.configPath), options.config);

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
    ...(options.logLevel ? { logLevel: options.logLevel } : {}),
    logger: options.quiet
      ? { log: () => { }, info: () => { }, warn: console.warn, error: console.error }
      : {
        log: (...args: any[]) => console.log('\x1b[90m[Curator]\x1b[0m', ...args),
        info: (...args: any[]) => console.log('\x1b[90m[Curator]\x1b[0m', ...args),
        warn: console.warn,
        error: console.error,
      },
    registerPlugins: async () => {
      if (options.llmProvider) {
        curatorEngine.registerLlmProvider('gemini', options.llmProvider);
      } else if (options.enableGemini !== false) {
        const apiKey = options.apiKey || getGeminiApiKey();
        const currentProvider = LlmFactory.getProvider('gemini');
        if (apiKey && (!currentProvider || currentProvider.providerName !== 'gemini')) {
          curatorEngine.registerPlugin(geminiPlugin({ apiKey }));
        }
      }
      curatorEngine.registerPlugin(pokerPlugin);
      curatorEngine.setConfig({ [POKER_CONFIG_NAMESPACE]: pokerConfig });
      return curatorEngine;
    },
  });
}
