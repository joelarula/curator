import { createCuratorHost, type CuratorHost } from '@curator/host';
import { registerKeerisPlugins } from './plugins/index.ts';
import { openDatabase, type DatabaseAdapter } from './db.ts';
import { config } from './config.ts';

export interface CreateKeerisHostOptions {
  domainDb?: DatabaseAdapter;
  dataDir?: string;
  intervalMs?: number;
}

export async function createKeerisHost(options: CreateKeerisHostOptions = {}): Promise<CuratorHost> {
  const databasePath = process.env.DATABASE_URL || process.env.DATABASE_PATH || config.defaultDatabase;
  const domainDb = options.domainDb || openDatabase(databasePath);

  const curatorDbUrl = process.env.CURATOR_DATABASE_URL || (process.env.DATABASE_URL?.startsWith('mysql://') || process.env.DATABASE_URL?.startsWith('mariadb://') ? process.env.DATABASE_URL : undefined);
  const curatorDbPath = process.env.CURATOR_DATABASE_PATH || 'data/curator.db';

  return createCuratorHost({
    name: 'keeris',
    dataDir: options.dataDir ?? process.env.DATA_DIR ?? './data',
    curatorDb: {
      url: curatorDbUrl,
      path: curatorDbPath,
    },
    domainDb,
    intervalMs: options.intervalMs ?? 5000,
    rbac: {
      managers: ['joel.arula@gmail.com'],
    },
    registerPlugins: async ({ domainDb: db }) => {
      return registerKeerisPlugins({ db: db || domainDb });
    },
  });
}
