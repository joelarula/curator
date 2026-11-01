import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { DatabaseSync } from 'node:sqlite';
import { convergeSchema, prismaSchemaDb, type ConvergeResult, type SchemaDb } from './schemaSql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findCuratorRoot(): string {
  let cur = __dirname;
  while (cur !== path.dirname(cur)) {
    for (const cand of [path.join(cur, 'prisma-sqlite', 'schema.prisma'), path.join(cur, 'curator', 'prisma-sqlite', 'schema.prisma')]) {
      if (fs.existsSync(cand)) return path.dirname(path.dirname(cand));
    }
    cur = path.dirname(cur);
  }
  return path.resolve(__dirname, '../../..');
}

const CURATOR_ROOT = findCuratorRoot();
const DATA_DIR = path.join(CURATOR_ROOT, 'data');

/**
 * Indexes older databases have that the Prisma schema no longer declares (schema convergence only adds):
 * McpServer names became unique per project, and Tool's mcpServerId index became the (mcpServerId, remoteName) key.
 */
const LEGACY_DROPS = ['DROP INDEX IF EXISTS "McpServer_name_key";', 'DROP INDEX IF EXISTS "Tool_mcpServerId_idx";'];

const sqliteFileSchemaDb = (db: DatabaseSync): SchemaDb => ({
  dialect: 'sqlite',
  query: async sql => db.prepare(sql).all() as any[],
  exec: async sql => {
    db.exec(sql);
  },
});

function reportConvergence(name: string, result: ConvergeResult): void {
  if (result.createdTables.length) console.log(`[Curator CLI] Schema: created ${result.createdTables.length} table(s) in ${name}`);
  if (result.addedColumns.length) console.log(`[Curator CLI] Schema: added ${result.addedColumns.join(', ')}`);
  for (const failure of result.failed) {
    console.warn(`[Curator CLI] Schema statement failed (needs a manual migration): ${failure.error}\n  ${failure.sql.split('\n')[0]}`);
  }
}

export async function provisionSqliteDb(name: string, forceReset: boolean = false, options: { databasePath?: string } = {}): Promise<PrismaClient> {
  // Validate name (alphanumeric, hyphens, underscores only)
  if (!/^[\w-]+$/.test(name)) {
    throw new Error(`[Curator CLI] Invalid database name "${name}". Use letters, numbers, hyphens or underscores only.`);
  }

  const dbPath = options.databasePath ? path.resolve(options.databasePath) : path.join(DATA_DIR, `${name}.db`);
  const dbDirectory = path.dirname(dbPath);
  if (!fs.existsSync(dbDirectory)) {
    fs.mkdirSync(dbDirectory, { recursive: true });
    console.log(`[Curator CLI] Created data directory: ${DATA_DIR}`);
  }

  const normalizedPath = dbPath.replace(/\\/g, '/');
  const dbUrl = `file:${normalizedPath}`;

  if (forceReset && fs.existsSync(dbPath)) {
    console.log(`[Curator CLI] 🗄️ Force resetting database: ${name}`);
    try {
      fs.unlinkSync(dbPath);
    } catch (err: any) {
      console.warn(`[Curator CLI] Warning: Failed to delete database file: ${err.message}`);
    }
  }

  const isNew = !fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0;
  console.log(isNew ? `[Curator CLI] 🗄️ Provisioning new database: ${name}` : `[Curator CLI] 🗄️ Using existing database: ${name}`);

  // The schema is prisma-sqlite/schema.sql, generated from schema.prisma: a new file gets all of it, an existing
  // one what it lacks (tables, columns, indexes)
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA synchronous = OFF;');
    for (const drop of LEGACY_DROPS) db.exec(drop);
    reportConvergence(name, await convergeSchema(sqliteFileSchemaDb(db)));
  } finally {
    db.close();
  }
  if (isNew) console.log(`[Curator CLI] ✓ Database ready: ${dbPath}`);

  const prisma = await createSqlitePrismaClient(dbUrl);

  // Set PRAGMA synchronous = OFF on the connection to bypass remote FlushFileBuffers calls over network shares
  try {
    await prisma.$executeRawUnsafe('PRAGMA synchronous = OFF;');
  } catch (_) {}
  // WAL lets reads run while a request writes (the polling processor runs requests concurrently).
  // Not on network shares (WAL needs shared memory); CURATOR_SQLITE_WAL=0 keeps the rollback journal.
  const isNetworkPath = /^(\\\\|\/\/)/.test(dbPath);
  if (!isNetworkPath && process.env.CURATOR_SQLITE_WAL !== '0') {
    try {
      await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
      await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 10000;');
    } catch (_) {}
  }
  // Full auto-vacuum: pages freed by retention go back to the file system at commit, so the file shrinks without
  // a manual VACUUM. (Not INCREMENTAL: the driver steps `PRAGMA incremental_vacuum` once, freeing a single page.)
  // An existing file switches mode only through one VACUUM, done here once.
  try {
    const [row] = (await prisma.$queryRawUnsafe('PRAGMA auto_vacuum;')) as Array<Record<string, unknown>>;
    if (Number(row?.auto_vacuum) !== 1) {
      await prisma.$executeRawUnsafe('PRAGMA auto_vacuum = FULL;');
      await prisma.$executeRawUnsafe('VACUUM;');
    }
  } catch (err: any) {
    console.warn(`[sqliteProvisioner] Could not enable auto-vacuum: ${err?.message || err}`);
  }

  await seedSystemRows(prisma);
  return prisma;
}

/** A PrismaClient on the SQLite database at `dbUrl` (`file:<path>` or `:memory:`) via the better-sqlite3 adapter. */
async function createSqlitePrismaClient(dbUrl: string): Promise<any> {
  let SqlitePrismaClient: any;
  const potentialPaths = [
    path.join(CURATOR_ROOT, 'src/generated/prisma-sqlite/index.js'),
    path.join(__dirname, '../../src/generated/prisma-sqlite/index.js'),
    path.join(__dirname, '../generated/prisma-sqlite/index.js'),
    path.join(CURATOR_ROOT, 'dist/src/generated/prisma-sqlite/index.js'),
  ];
  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      const mod = await import(pathToFileURL(p).href);
      SqlitePrismaClient = mod.PrismaClient;
      break;
    }
  }
  if (!SqlitePrismaClient) {
    const mod = await import('../generated/prisma-sqlite/index.js');
    SqlitePrismaClient = mod.PrismaClient;
  }

  const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  return new SqlitePrismaClient({ adapter }) as any;
}

/** Ensure system user and project exist */
async function seedSystemRows(prisma: any): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: 'system@local' },
    update: {},
    create: { id: 'system', name: 'System User', email: 'system@local' }
  });

  await prisma.project.upsert({
    where: { id: '1' },
    update: {},
    create: { id: '1', name: 'System Project', userId: user.id }
  });
}

/**
 * A curator database that lives only in this process (the `ephemeral` durability tier): same schema as
 * provisionSqliteDb (prisma-sqlite/schema.sql), created in milliseconds, gone when the client disconnects or the
 * process exits.
 *
 * `idBase` starts every autoincrement id at that value, so rows created here never collide with rows copied in
 * from a durable database with their original (lower) ids. Ids are 32-bit, so durable ids must stay below it.
 */
export async function provisionMemorySqliteDb(options: { idBase?: number } = {}): Promise<any> {
  const prisma = await createSqlitePrismaClient(':memory:');
  const result = await convergeSchema(prismaSchemaDb(prisma));
  if (result.failed.length) throw new Error(`[sqliteProvisioner] Memory schema failed: ${result.failed[0].error}`);
  if (options.idBase) {
    const tables = (await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%AUTOINCREMENT%'"
    )) as Array<{ name: string }>;
    for (const { name } of tables) {
      await prisma.$executeRawUnsafe('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)', name, options.idBase - 1);
    }
  }
  await seedSystemRows(prisma);
  return prisma;
}
