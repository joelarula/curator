import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCuratorHost, type CuratorHost } from './curatorHost.ts';
import { curatorEngine, LlmFactory } from './curator.ts';
import { pokerPlugin } from './plugins/pokerPlugin.ts';
import { geminiPlugin } from '@curator/plugin-llm-gemini';
import { getGeminiApiKey, loadPokerAppConfig } from './env.ts';
import { prunePokerHistory, historyTtlFromEnv } from './db/retention.ts';
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
  /** Path of the poker config file (default: `POKER_CONFIG`, then `poker.config.yaml` / `.yml` / `.json` in cwd or the module root). */
  configPath?: string;
  /** Active app profiles, e.g. `'dev'` -> `poker.config.dev.yaml` (default: `--profile`, `POKER_PROFILES`, `CURATOR_PROFILES`). */
  profiles?: string | string[];
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

  // What workflows read as `$config.poker`: the config file and its profile files, then these options, over the defaults
  const appConfig = loadPokerAppConfig({ configPath: options.configPath, profiles: options.profiles });
  const pokerConfig = resolvePokerConfig(appConfig.values, options.config);

  const host = await createCuratorHost({
    // `host:` section of the config files (host profile, retention, ...); explicit options below win
    ...appConfig.host,
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

  // Retention: finished tables and lobbies drop their step history once past the TTL (the database stays small)
  try {
    const pruned = await prunePokerHistory(host.prisma, { projectId: host.project.id, olderThanMs: historyTtlFromEnv() });
    if (pruned.conversations > 0 && !options.quiet) {
      console.log(
        `\x1b[90m[Curator] Retention: pruned ${pruned.conversations} finished conversation(s) (${pruned.requests} requests, ${pruned.responses} responses, ${pruned.events} events)\x1b[0m`
      );
    }
  } catch (err: any) {
    console.warn(`[Curator] Retention skipped: ${err?.message || err}`);
  }
  return host;
}
