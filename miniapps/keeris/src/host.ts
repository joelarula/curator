import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCuratorHost,
  resolveClientIdentity,
  type CuratorHost,
} from '@curator/host';
import { loadAppConfig, type AppHostSettings } from '@curator/host/config';
import { registerKeerisPlugins } from './plugins/index.ts';
import { openDatabase, type DatabaseAdapter } from './db.ts';
import { config } from './config.ts';
import { KeerisConstant } from './models/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
}

export async function createKeerisHost(options: CreateKeerisHostOptions = {}): Promise<CuratorHost> {
  const databasePath =
    options.databasePath ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_PATH ||
    config.defaultDatabase ||
    DEFAULT_KEERIS_DB;
  const domainDb = options.domainDb || openDatabase(databasePath);

  const isExplicitSqlite =
    options.databasePath &&
    (options.databasePath === ':memory:' ||
      options.databasePath.endsWith('.db') ||
      options.databasePath.endsWith('.sqlite'));

  const curatorDbUrl = isExplicitSqlite
    ? undefined
    : options.curatorDbUrl ||
      process.env.CURATOR_DATABASE_URL ||
      (process.env.DATABASE_URL?.startsWith('mysql://') || process.env.DATABASE_URL?.startsWith('mariadb://')
        ? process.env.DATABASE_URL
        : undefined);
  const curatorDbPath =
    options.curatorDbPath ||
    process.env.CURATOR_DATABASE_PATH ||
    DEFAULT_CURATOR_DB;

  // Load app config profiles (keeris.config.<profile>.yaml, etc.)
  let appConfig: { host: AppHostSettings; values: any } = { host: {}, values: {} };
  try {
    appConfig = loadAppConfig({
      appId: KeerisConstant.APP_ID,
      configPath: options.configPath,
      profiles: options.profiles,
    });
  } catch {
    // Config file is optional
  }

  // Actor resolution: if actor displayName/interactive is given, resolve client identity
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

  const curatorDb = isExplicitSqlite
    ? { url: '', path: curatorDbPath }
    : { url: curatorDbUrl, path: curatorDbPath };

  const effectiveLogLevel = options.logLevel || process.env.LOG_LEVEL;

  const host = await createCuratorHost({
    ...appConfig.host,
    name: options.name || KeerisConstant.APP_ID,
    projectId: options.projectId || `${KeerisConstant.APP_ID}-project-1`,
    projectName: options.projectName || 'Keeris Radio Archive',
    dataDir: options.dataDir ?? process.env.DATA_DIR ?? './data',
    curatorDb,
    domainDb,
    intervalMs: options.intervalMs ?? 3000,
    ...(options.userId ? { userId: options.userId } : actorInfo.userId ? { userId: actorInfo.userId } : {}),
    ...(options.userName ? { userName: options.userName } : actorInfo.userName ? { userName: actorInfo.userName } : {}),
    ...(options.userEmail ? { userEmail: options.userEmail } : actorInfo.userEmail ? { userEmail: actorInfo.userEmail } : {}),
    ...(options.autoSeed !== undefined ? { autoSeed: options.autoSeed } : {}),
    ...(options.forceReset !== undefined ? { forceReset: options.forceReset } : {}),
    ...(effectiveLogLevel ? { logLevel: effectiveLogLevel } : {}),
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

  if (options.autoSeed) {
    await host.seed();
  }

  return host;
}
