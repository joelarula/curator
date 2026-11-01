import { randomBytes } from 'node:crypto';
import { provisionPostgresDb } from './postgresProvisioner.js';
import { provisionMariadbDb } from './mariadbProvisioner.js';

/**
 * Throwaway curator databases on a real MariaDB/MySQL or Postgres server, for tests: each call creates a new,
 * empty database `curator_test_<random>`, applies the schema (the provisioner's convergence of the generated
 * schema.sql) and returns a client. `drop()` disconnects and drops exactly that database, never another one.
 *
 * The server URL's own database is only used to connect for CREATE/DROP DATABASE, e.g.
 * `postgresql://user:pass@host:5432/postgres` or `mysql://user:pass@host:3306/mysql`; the user needs the right
 * to create databases.
 */
export interface TestDatabase {
  name: string;
  /** Connection URL of the test database. */
  url: string;
  prisma: any;
  drop(): Promise<void>;
}

const TEST_DATABASE = /^curator_test_[a-z0-9]+$/;

const isPostgres = (url: string) => url.startsWith('postgres://') || url.startsWith('postgresql://');
const isMysql = (url: string) => url.startsWith('mysql://') || url.startsWith('mariadb://');

/** Runs one administrative statement on the server (outside the test database). */
async function adminQuery(serverUrl: string, sql: string): Promise<void> {
  if (isPostgres(serverUrl)) {
    const pgMod: any = await import('pg');
    const client = new (pgMod.default ?? pgMod).Client({ connectionString: serverUrl });
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
    return;
  }
  const mariadbMod: any = await import('mariadb');
  const url = new URL(serverUrl);
  const conn = await (mariadbMod.default ?? mariadbMod).createConnection({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    allowPublicKeyRetrieval: true,
  });
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

export async function createTestDatabase(serverUrl: string): Promise<TestDatabase> {
  if (!isPostgres(serverUrl) && !isMysql(serverUrl)) {
    throw new Error('[testDatabase] Expected a postgres:// or mysql:// / mariadb:// server URL');
  }
  const name = `curator_test_${randomBytes(6).toString('hex')}`;
  const quoted = isPostgres(serverUrl) ? `"${name}"` : `\`${name}\``;
  await adminQuery(serverUrl, isPostgres(serverUrl) ? `CREATE DATABASE ${quoted}` : `CREATE DATABASE ${quoted} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  url.searchParams.delete('schema');
  let prisma: any;
  try {
    prisma = isPostgres(serverUrl) ? await provisionPostgresDb(url.toString()) : await provisionMariadbDb(url.toString());
  } catch (err) {
    await adminQuery(serverUrl, `DROP DATABASE IF EXISTS ${quoted}`).catch(() => {});
    throw err;
  }

  return {
    name,
    url: url.toString(),
    prisma,
    drop: async () => {
      await prisma.$disconnect().catch(() => {});
      if (!TEST_DATABASE.test(name)) throw new Error(`[testDatabase] Refusing to drop '${name}'`);
      await adminQuery(serverUrl, `DROP DATABASE IF EXISTS ${quoted}${isPostgres(serverUrl) ? ' WITH (FORCE)' : ''}`);
    },
  };
}
