import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { convergeSchema } from './schemaSql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The schema is prisma-mariadb/schema.sql, generated from schema.prisma: a new database gets all of it, an existing
 * one what it lacks (tables, columns, indexes, foreign keys). See schemaSql.ts.
 */
async function ensureCuratorMariadbSchema(pool: any): Promise<void> {
  const result = await convergeSchema({
    dialect: 'mysql',
    query: async (sql) => Array.from(await pool.query(sql)),
    exec: async (sql) => {
      await pool.query(sql);
    },
  });
  if (result.createdTables.length) console.log(`[mariadbProvisioner] Schema: created ${result.createdTables.length} table(s)`);
  if (result.addedColumns.length) console.log(`[mariadbProvisioner] Schema: added ${result.addedColumns.join(', ')}`);
  for (const failure of result.failed) {
    console.warn(`[mariadbProvisioner] Schema statement failed (needs a manual migration): ${failure.error}\n  ${failure.sql.split('\n')[0]}`);
  }
}

export async function provisionMariadbDb(connectionUrl: string = process.env.CURATOR_DATABASE_URL || process.env.DATABASE_URL || ''): Promise<any> {
  if (!connectionUrl) {
    throw new Error('MariaDB connection URL is required (set CURATOR_DATABASE_URL or DATABASE_URL in environment)');
  }
  let PrismaMariaDb: any;
  let mariadbMod: any;
  try {
    const adapterMod = await import('@prisma/adapter-mariadb');
    PrismaMariaDb = adapterMod.PrismaMariaDb || (adapterMod as any).default?.PrismaMariaDb;
    mariadbMod = await import('mariadb');
  } catch (err: any) {
    throw new Error(`MariaDB adapter dependencies not found (@prisma/adapter-mariadb / mariadb): ${err?.message || err}`);
  }
  const mariadb = mariadbMod.default || mariadbMod;

  const url = new URL(connectionUrl);
  const pool = mariadb.createPool({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    connectionLimit: 25,
    connectTimeout: 10000,
    acquireTimeout: 30000,
    idleTimeout: 60000,
    minimumIdle: 2,
    allowPublicKeyRetrieval: true,
  });

  // Ensure Curator schema exists in MariaDB before Prisma connects
  await ensureCuratorMariadbSchema(pool);

  // disposeExternalPool: $disconnect() ends the pool too (clean shutdown, droppable test databases)
  const adapter = new PrismaMariaDb(pool as any, { disposeExternalPool: true });
  
  let MariadbPrismaClient: any;
  const potentialPaths = [
    path.join(__dirname, '../generated/prisma-mariadb/index.js'),
    path.join(__dirname, '../../src/generated/prisma-mariadb/index.js'),
    path.join(__dirname, '../../../src/generated/prisma-mariadb/index.js'),
    path.join(__dirname, '../../../curator/src/generated/prisma-mariadb/index.js'),
    path.join(__dirname, '../../../../curator/src/generated/prisma-mariadb/index.js'),
    path.join(process.cwd(), 'src/generated/prisma-mariadb/index.js'),
    path.join(process.cwd(), 'curator/src/generated/prisma-mariadb/index.js'),
    path.join(process.cwd(), '../../curator/src/generated/prisma-mariadb/index.js'),
    path.join(process.cwd(), '../curator/src/generated/prisma-mariadb/index.js'),
  ];
  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      const mod = await import(pathToFileURL(p).href);
      MariadbPrismaClient = mod.PrismaClient;
      if (MariadbPrismaClient) break;
    }
  }
  if (!MariadbPrismaClient) {
    try {
      const mod = await import('@prisma/client');
      MariadbPrismaClient = mod.PrismaClient;
    } catch (_) {}
  }
  if (!MariadbPrismaClient) {
    throw new Error(
      `MariaDB Prisma Client not found. Checked: ${potentialPaths.join(', ')}. Please run: pnpm --filter @curator/agent-server run prisma:mariadb:generate`
    );
  }

  const prisma = new (MariadbPrismaClient as any)({ adapter });

  // Ensure system user and project exist
  const user = await prisma.user.upsert({
    where: { email: 'system@local' },
    update: {},
    create: { id: '1', name: 'System User', email: 'system@local' },
  });

  await prisma.project.upsert({
    where: { id: '1' },
    update: {},
    create: { id: '1', name: 'Keeris', userId: user.id },
  });

  return prisma;
}
