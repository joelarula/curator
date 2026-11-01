import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCuratorHost,
  resolveClientIdentity,
  type CuratorHost,
} from '@curator/host';
import {
  loadAppConfig,
  profilesFromArgv,
  type AppHostSettings,
  type AppConfig,
} from '@curator/host/config';
import { registerKeerisPlugins } from './plugins/index.ts';
import { openDatabase, type DatabaseAdapter } from './db.ts';
import { config } from './config.ts';
import { KeerisConstant } from './models/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const keerisRoot = path.dirname(__dirname);

// Ensure environment is loaded from .env if not already loaded
const envCandidates = [
  path.join(keerisRoot, '.env'),
  path.join(process.cwd(), '.env'),
  path.join(keerisRoot, '.env.production'),
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
      break;
    } catch {}
  }
}

const DEFAULT_CURATOR_DB = path.resolve(__dirname, '../data/curator.db');
const DEFAULT_KEERIS_DB = path.resolve(__dirname, '../data/keeris.db');

export interface CreateKeerisHostOptions {
  name?: string;
  projectId?: string;
  projectName?: string;
  domainDb?: DatabaseAdapter;
  databasePath?: string;
  curatorDbUrl?: string;
  curatorDbPath?: string;
  dataDir?: string;
  intervalMs?: number;
  quiet?: boolean;
  logLevel?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  actor?: { displayName?: string; interactive?: boolean };
  autoSeed?: boolean;
  forceReset?: boolean;
  configPath?: string;
  profiles?: string | string[];
  /** Where conversations run (default: the config file's `host.durability`, else 'durable'); see CuratorHostConfig.durability. */
  durability?: 'durable' | 'ephemeral' | 'checkpoint';
}

export async function createKeerisHost(options: CreateKeerisHostOptions = {}): Promise<CuratorHost> {
  // 1. Layered configuration & profiles (keeris.config.yaml, keeris.config.<profile>.yaml)
  let appConfig: AppConfig = {
    appId: KeerisConstant.APP_ID,
    activeProfiles: [],
    values: {},
    host: {},
    sources: [],
  };
  try {
    appConfig = loadAppConfig({
      appId: KeerisConstant.APP_ID,
      configPath: options.configPath || process.env.KEERIS_CONFIG,
      profiles: options.profiles || profilesFromArgv(),
      searchDirs: [process.cwd(), keerisRoot],
      envDirs: [process.cwd(), keerisRoot, path.resolve(keerisRoot, '../..')],
    });
  } catch {
    // Config file is optional
  }

  // 2. Database path & engine resolution
  const databasePath =
    options.databasePath ||
    appConfig.values.database?.url ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_PATH ||
    config.defaultDatabase ||
    DEFAULT_KEERIS_DB;
  const domainDb = options.domainDb || openDatabase(databasePath);

  const isExplicitSqlite =
    typeof options.databasePath === 'string' &&
    (options.databasePath === ':memory:' ||
      options.databasePath.endsWith('.db') ||
      options.databasePath.endsWith('.sqlite'));

  const isMariaDb =
    !isExplicitSqlite &&
    typeof databasePath === 'string' &&
    (databasePath.startsWith('mysql://') || databasePath.startsWith('mariadb://'));

  const curatorDbUrl = isExplicitSqlite
    ? undefined
    : options.curatorDbUrl ||
      appConfig.values.database?.curatorUrl ||
      process.env.CURATOR_DATABASE_URL ||
      (isMariaDb ? databasePath : undefined);
  const curatorDbPath =
    options.curatorDbPath ||
    appConfig.values.database?.curatorSqlitePath ||
    process.env.CURATOR_DATABASE_PATH ||
    DEFAULT_CURATOR_DB;

  const curatorDb = isExplicitSqlite
    ? { url: '', path: curatorDbPath }
    : { url: curatorDbUrl, path: curatorDbPath };

  if (!options.quiet) {
    if (appConfig.activeProfiles.length > 0) {
      console.log(`\x1b[36m[Keeris Host] Profiles:\x1b[0m \x1b[33m${appConfig.activeProfiles.join(', ')}\x1b[0m (from ${appConfig.sources.map((s: string) => path.basename(s)).join(', ')})`);
    }
    const maskedTarget = typeof databasePath === 'string'
      ? databasePath.replace(/:[^:@]+@/, ':****@')
      : 'in-memory';
    const dbEngine = isMariaDb ? 'MariaDB/MySQL' : 'SQLite';
    console.log(`\x1b[36m[Keeris Host] Database engine:\x1b[0m \x1b[32m${dbEngine}\x1b[0m (${maskedTarget})`);
  }

  // 3. Actor resolution: if actor displayName/interactive is given, resolve client identity
  let actorInfo: { userId?: string; userName?: string; userEmail?: string } = {};
  if (options.actor) {
    const identity = await resolveClientIdentity({
      appId: KeerisConstant.APP_ID,
      displayName: options.actor.displayName,
      interactive: options.actor.interactive,
      fallbackName: KeerisConstant.DEFAULT_ACTOR_NAME,
    });
    actorInfo = {
      userId: identity.userId,
      userName: identity.displayName,
      userEmail: `${identity.userId}@local`,
    };
  }

  const effectiveLogLevel = options.logLevel || appConfig.host.logLevel || process.env.LOG_LEVEL;

  const host = await createCuratorHost({
    ...appConfig.host,
    name: options.name || KeerisConstant.APP_ID,
    projectId: options.projectId || `${KeerisConstant.APP_ID}-project-1`,
    projectName: options.projectName || 'Keeris Radio Archive',
    dataDir: options.dataDir ?? appConfig.values.dataDir ?? process.env.DATA_DIR ?? './data',
    curatorDb,
    domainDb,
    intervalMs: options.intervalMs ?? appConfig.host.intervalMs ?? 3000,
    ...(options.userId ? { userId: options.userId } : actorInfo.userId ? { userId: actorInfo.userId } : {}),
    ...(options.userName ? { userName: options.userName } : actorInfo.userName ? { userName: actorInfo.userName } : {}),
    ...(options.userEmail ? { userEmail: options.userEmail } : actorInfo.userEmail ? { userEmail: actorInfo.userEmail } : {}),
    ...(options.autoSeed !== undefined ? { autoSeed: options.autoSeed } : {}),
    ...(options.forceReset !== undefined ? { forceReset: options.forceReset } : {}),
    ...(effectiveLogLevel ? { logLevel: effectiveLogLevel } : {}),
    ...(options.durability ? { durability: options.durability } : {}),
    logger: options.quiet
      ? { log: () => {}, info: () => {}, warn: console.warn, error: console.error }
      : {
          log: (...args: any[]) => console.log('\x1b[90m[Keeris Host]\x1b[0m', ...args),
          info: (...args: any[]) => console.log('\x1b[90m[Keeris Host]\x1b[0m', ...args),
          warn: console.warn,
          error: console.error,
        },
    rbac: {
      managers: ['joel.arula@gmail.com'],
    },
    registerPlugins: async ({ domainDb: db }) => {
      return registerKeerisPlugins({ db: db || domainDb });
    },
  });

  // A domain database this host opened closes with it (one passed in belongs to the caller)
  if (!options.domainDb) {
    const stopHost = host.stop.bind(host);
    let closed = false;
    host.stop = async () => {
      try {
        await stopHost();
      } finally {
        if (!closed) {
          closed = true;
          await domainDb.close();
        }
      }
    };
  }

  if (options.autoSeed) {
    await host.seed();
  }

  return host;
}
