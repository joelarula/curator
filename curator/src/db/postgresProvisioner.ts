import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Arbitrary constant: the advisory lock nodes take while one of them creates the schema. */
const SCHEMA_LOCK_KEY = 0x63757261; // 'cura'

export interface PostgresProvisionOptions {
  /**
   * 'auto' (default): when curator's tables are missing, one node creates them with `prisma db push` while the
   * others wait on an advisory lock. 'never': the schema is managed by deploys (use it behind PgBouncer in
   * transaction mode, where session advisory locks do not hold, or when the app role has no DDL rights).
   */
  schema?: 'auto' | 'never';
  /** Pool size per process. Default 25 (as for MariaDB). */
  poolMax?: number;
}

function findCuratorFile(relative: string): string | undefined {
  let cur = __dirname;
  while (cur !== path.dirname(cur)) {
    for (const cand of [path.join(cur, relative), path.join(cur, 'curator', relative)]) {
      if (fs.existsSync(cand)) return cand;
    }
    cur = path.dirname(cur);
  }
  return undefined;
}

async function hasCuratorSchema(client: any, schema: string | undefined): Promise<boolean> {
  const table = (name: string) => (schema ? `"${schema.replace(/"/g, '""')}"."${name}"` : `"${name}"`);
  // The newest table too: a database from before it gets it added by the (non-destructive) push
  const { rows } = await client.query(
    'SELECT to_regclass($1) IS NOT NULL AS request, to_regclass($2) IS NOT NULL AS subs, to_regclass($3) IS NOT NULL AS leases',
    [table('Request'), table('EventSubscription'), table('ConversationLease')]
  );
  return Boolean(rows[0]?.request && rows[0]?.subs && rows[0]?.leases);
}

async function ensureCuratorPostgresSchema(pool: any, connectionUrl: string, schema: string | undefined): Promise<void> {
  const client = await pool.connect();
  try {
    if (await hasCuratorSchema(client, schema)) return;
    await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK_KEY]);
    try {
      // Another node may have created it while this one waited for the lock
      if (await hasCuratorSchema(client, schema)) return;
      const schemaPath = findCuratorFile(path.join('prisma-postgres', 'schema.prisma'));
      if (!schemaPath) throw new Error('[postgresProvisioner] prisma-postgres/schema.prisma not found');
      console.log('[Curator CLI] 🗄️ Creating curator schema in Postgres...');
      // No --accept-data-loss: on a shared database a destructive change must fail, not run
      execSync(`npx prisma db push --schema="${schemaPath}" --url="${connectionUrl}"`, {
        stdio: 'inherit',
        cwd: path.dirname(path.dirname(schemaPath)),
      });
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK_KEY]);
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

  if (options.schema !== 'never') await ensureCuratorPostgresSchema(pool, connectionUrl, schema);

  const adapter = new PrismaPg(pool, schema ? { schema } : undefined);

  let PostgresPrismaClient: any;
  const potentialPaths = [
    path.join(__dirname, '../generated/prisma-postgres/index.js'),
    path.join(__dirname, '../../src/generated/prisma-postgres/index.js'),
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
