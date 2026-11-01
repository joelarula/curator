import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqlDialect } from './sqlDialect.js';

/**
 * Database schemas come from the Prisma schemas only. `scripts/generate-schema-sql.mjs` (npm run prisma:sql)
 * writes `prisma-<engine>/schema.sql` with `prisma migrate diff --from-empty`, and every provisioner applies that
 * file through `convergeSchema`: missing tables are created and missing columns, indexes and foreign keys added.
 * Nothing is dropped or altered, so existing data is never at risk; a change that needs that (a type change, a new
 * NOT NULL column without a default on a non-empty table) is reported in `failed` and needs a manual migration.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCHEMA_FOLDERS: Record<SqlDialect, string> = {
  sqlite: 'prisma-sqlite',
  mysql: 'prisma-mariadb',
  postgresql: 'prisma-postgres',
};

/** The generated `prisma-<engine>/schema.sql`, found upwards from this module (source and dist layouts). */
export function readSchemaSql(dialect: SqlDialect): string {
  const relative = path.join(SCHEMA_FOLDERS[dialect], 'schema.sql');
  for (let dir = __dirname; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    for (const candidate of [path.join(dir, relative), path.join(dir, 'curator', relative)]) {
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
    }
  }
  throw new Error(`[schemaSql] ${relative} not found; run: npm --prefix curator run prisma:sql`);
}

export interface SchemaColumn {
  name: string;
  /** Everything after the column name, e.g. `INTEGER NOT NULL DEFAULT 0`. */
  definition: string;
}

export type SchemaStatement =
  | {
      kind: 'table';
      table: string;
      sql: string;
      columns: SchemaColumn[];
      /** MySQL/MariaDB declare indexes inside CREATE TABLE: `(unique) name (columns)`. */
      inlineIndexes: Array<{ name: string; unique: boolean; columns: string }>;
    }
  | { kind: 'index'; table: string; sql: string }
  | { kind: 'foreignKey'; table: string; sql: string }
  | { kind: 'other'; sql: string };

const IDENT = '[`"](\\w+)[`"]';

/** Splits the generated SQL into statements (it has no semicolons inside statements). */
export function parseSchemaSql(sql: string): SchemaStatement[] {
  const text = sql
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n');
  return text
    .split(/;\s*(?:\n|$)/)
    .map(s => s.trim())
    .filter(Boolean)
    .map((statement): SchemaStatement => {
      const table = statement.match(new RegExp(`^CREATE TABLE ${IDENT} \\(`));
      if (table) {
        const body = statement.slice(statement.indexOf('(') + 1, statement.lastIndexOf(')'));
        const columns: SchemaColumn[] = [];
        const inlineIndexes: Array<{ name: string; unique: boolean; columns: string }> = [];
        for (const raw of body.split('\n')) {
          const line = raw.trim().replace(/,$/, '');
          const column = line.match(new RegExp(`^${IDENT}\\s+(.+)$`));
          if (column) {
            columns.push({ name: column[1], definition: column[2] });
            continue;
          }
          const index = line.match(new RegExp(`^(UNIQUE )?INDEX ${IDENT}(\\(.+\\))$`));
          if (index) inlineIndexes.push({ unique: Boolean(index[1]), name: index[2], columns: index[3] });
        }
        return { kind: 'table', table: table[1], sql: statement, columns, inlineIndexes };
      }
      const index = statement.match(new RegExp(`^CREATE (?:UNIQUE )?INDEX ${IDENT} ON ${IDENT}`));
      if (index) return { kind: 'index', table: index[2], sql: statement };
      const foreignKey = statement.match(new RegExp(`^ALTER TABLE ${IDENT} ADD CONSTRAINT`));
      if (foreignKey) return { kind: 'foreignKey', table: foreignKey[1], sql: statement };
      return { kind: 'other', sql: statement };
    });
}

/** What `convergeSchema` runs its statements against. */
export interface SchemaDb {
  dialect: SqlDialect;
  query(sql: string): Promise<any[]>;
  exec(sql: string): Promise<void>;
}

export interface ConvergeResult {
  createdTables: string[];
  addedColumns: string[];
  /** Statements that failed for another reason than the object already existing. */
  failed: Array<{ sql: string; error: string }>;
}

/** Lower-cased table name -> lower-cased column names. */
async function existingColumns(db: SchemaDb): Promise<Map<string, Set<string>>> {
  const tables = new Map<string, Set<string>>();
  const add = (table: unknown, column: unknown) => {
    const key = String(table).toLowerCase();
    if (!tables.has(key)) tables.set(key, new Set());
    tables.get(key)!.add(String(column).toLowerCase());
  };
  if (db.dialect === 'sqlite') {
    for (const { name } of await db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")) {
      for (const column of await db.query(`PRAGMA table_info("${String(name).replace(/"/g, '""')}")`)) add(name, column.name);
    }
  } else {
    const sql =
      db.dialect === 'mysql'
        ? 'SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()'
        : 'SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = current_schema()';
    for (const row of await db.query(sql)) add(row.t ?? row.T ?? row.TABLE_NAME, row.c ?? row.C ?? row.COLUMN_NAME);
  }
  return tables;
}

const ALREADY_EXISTS = /already exists|duplicate/i;

/** Applies the generated schema additively (see the module comment). Idempotent: a second run changes nothing. */
export async function convergeSchema(db: SchemaDb, sql: string = readSchemaSql(db.dialect)): Promise<ConvergeResult> {
  const result: ConvergeResult = { createdTables: [], addedColumns: [], failed: [] };
  const existing = await existingColumns(db);
  const quote = (name: string) => (db.dialect === 'mysql' ? `\`${name}\`` : `"${name}"`);
  const run = async (statement: string, existsIsFine = true): Promise<boolean> => {
    try {
      await db.exec(statement);
      return true;
    } catch (err: any) {
      const error = String(err?.message ?? err);
      if (!(existsIsFine && ALREADY_EXISTS.test(error))) result.failed.push({ sql: statement, error });
      return false;
    }
  };

  for (const statement of parseSchemaSql(sql)) {
    if (statement.kind === 'table') {
      const have = existing.get(statement.table.toLowerCase());
      if (!have) {
        if (await run(statement.sql, false)) result.createdTables.push(statement.table);
        continue;
      }
      for (const column of statement.columns) {
        if (have.has(column.name.toLowerCase())) continue;
        const added = await run(`ALTER TABLE ${quote(statement.table)} ADD COLUMN ${quote(column.name)} ${column.definition}`, false);
        if (added) result.addedColumns.push(`${statement.table}.${column.name}`);
      }
      // MariaDB syntax (IF NOT EXISTS on ADD INDEX); the other engines declare indexes as separate statements
      for (const index of statement.inlineIndexes) {
        await run(`ALTER TABLE ${quote(statement.table)} ADD ${index.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${quote(index.name)}${index.columns}`);
      }
    } else if (statement.kind === 'index') {
      await run(statement.sql.replace(/^CREATE (UNIQUE )?INDEX /, 'CREATE $1INDEX IF NOT EXISTS '));
    } else {
      // Foreign keys, CREATE SCHEMA, CREATE TYPE: an existing one reports "already exists" / "duplicate"
      await run(statement.sql);
    }
  }
  return result;
}

/** A Prisma client as a SchemaDb (memory databases, tests). */
export const prismaSchemaDb = (prisma: any, dialect: SqlDialect = 'sqlite'): SchemaDb => ({
  dialect,
  query: sql => prisma.$queryRawUnsafe(sql),
  exec: async sql => {
    await prisma.$executeRawUnsafe(sql);
  },
});
