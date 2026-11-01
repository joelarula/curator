import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { convergeSchema, type SchemaDb } from './schemaSql.js';
import { convergePartitions, reportPartitions } from './partitions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Arbitrary constant: the advisory lock nodes hold while one of them brings the schema up to date. */
const SCHEMA_LOCK_KEY = 0x63757261; // 'cura'

export interface PostgresProvisionOptions {
  /**
   * 'auto' (default): at startup, one node at a time (advisory lock) applies prisma-postgres/schema.sql, generated
   * from schema.prisma, additively: missing tables, columns, indexes and foreign keys. 'never': the schema is
   * managed by deploys (use it behind PgBouncer in transaction mode, where session advisory locks do not hold, or
   * when the app role has no DDL rights).
   */
  schema?: 'auto' | 'never';
  /** Pool size per process. Default 25 (as for MariaDB). */
  poolMax?: number;
}

async function ensureCuratorPostgresSchema(pool: any, schema: string | undefined): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK_KEY]);
    try {
      if (schema) {
        const quoted = `"${schema.replace(/"/g, '""')}"`;
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoted}`);
        // The generated SQL uses unqualified names: point this session at the curator schema
        await client.query(`SET search_path TO ${quoted}`);
      }
      const db: SchemaDb = {
        dialect: 'postgresql',
        query: async (sql) => (await client.query(sql)).rows,
        exec: async (sql) => {
          await client.query(sql);
        },
      };
      const result = await convergeSchema(db);
      if (result.createdTables.length) console.log(`[postgresProvisioner] Schema: created ${result.createdTables.length} table(s)`);
      if (result.addedColumns.length) console.log(`[postgresProvisioner] Schema: added ${result.addedColumns.join(', ')}`);
      for (const failure of result.failed) {
        console.warn(`[postgresProvisioner] Schema statement failed (needs a manual migration): ${failure.error}\n  ${failure.sql.split('\n')[0]}`);
      }
      reportPartitions('postgresProvisioner', await convergePartitions(db));
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK_KEY]);
      if (schema) await client.query('RESET search_path');
    }
  } finally {
    client.release();
  }
}

/**
 * Prisma client for curator on Postgres (`postgres://` / `postgresql://` URL; `?schema=name` selects a schema).
 * Point it at the primary: the request queue and conversation state must never be read from a lagging replica.
 */
export async function provisionPostgresDb(
  connectionUrl: string = process.env.CURATOR_DATABASE_URL || process.env.DATABASE_URL || '',
  options: PostgresProvisionOptions = {}
): Promise<any> {
  if (!connectionUrl) {
    throw new Error('Postgres connection URL is required (set CURATOR_DATABASE_URL or DATABASE_URL in environment)');
  }
  let PrismaPg: any;
  let pgMod: any;
  try {
    const adapterMod: any = await import('@prisma/adapter-pg');
    PrismaPg = adapterMod.PrismaPg || adapterMod.default?.PrismaPg;
    pgMod = await import('pg');
  } catch (err: any) {
    throw new Error(`Postgres adapter dependencies not found (@prisma/adapter-pg / pg): ${err?.message || err}`);
  }
  const pg = pgMod.default || pgMod;

  const url = new URL(connectionUrl);
  const schema = url.searchParams.get('schema') || undefined;
  // `schema` is a Prisma parameter, not a libpq one
  const poolUrl = new URL(connectionUrl);
  poolUrl.searchParams.delete('schema');
  const pool = new pg.Pool({
    connectionString: poolUrl.toString(),
    max: options.poolMax ?? 25,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 60000,
  });

  if (options.schema !== 'never') await ensureCuratorPostgresSchema(pool, schema);

  // disposeExternalPool: $disconnect() ends the pool too (clean shutdown, droppable test databases)
  const adapter = new PrismaPg(pool, { ...(schema ? { schema } : {}), disposeExternalPool: true });

  let PostgresPrismaClient: any;
  const potentialPaths = [
    path.join(__dirname, '../generated/prisma-postgres/index.js'),
    path.join(__dirname, '../../src/generated/prisma-postgres/index.js'),
    path.join(__dirname, '../../../src/generated/prisma-postgres/index.js'),
    path.join(__dirname, '../../../curator/src/generated/prisma-postgres/index.js'),
    path.join(process.cwd(), 'src/generated/prisma-postgres/index.js'),
    path.join(process.cwd(), 'curator/src/generated/prisma-postgres/index.js'),
  ];
  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      PostgresPrismaClient = (await import(pathToFileURL(p).href)).PrismaClient;
      if (PostgresPrismaClient) break;
    }
  }
  if (!PostgresPrismaClient) {
    await pool.end();
    throw new Error(
      `Postgres Prisma Client not found. Checked: ${potentialPaths.join(', ')}. Please run: npm --prefix curator run prisma:postgres:generate`
    );
  }

  const prisma = new PostgresPrismaClient({ adapter });

  // Ensure system user and project exist (same rows as provisionSqliteDb)
  const user = await prisma.user.upsert({
    where: { email: 'system@local' },
    update: {},
    create: { id: 'system', name: 'System User', email: 'system@local' },
  });
  await prisma.project.upsert({
    where: { id: '1' },
    update: {},
    create: { id: '1', name: 'System Project', userId: user.id },
  });

  return prisma;
}
