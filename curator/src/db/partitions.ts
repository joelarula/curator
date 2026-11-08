import { parseSchemaSql, readSchemaSql, type SchemaDb } from './schemaSql.js';

/**
 * Time partitions (docs/DISTRIBUTED_STORAGE_PLAN.md, Phase 3) for append-only tables on Postgres and MariaDB:
 * one range partition per UTC day on a time column, data retired by dropping whole partitions instead of deleting
 * rows. Prisma cannot declare partitions, so they come from this spec; the DDL is built here from it and from the
 * generated schema.sql (never hand-written per table). SQLite has no partitions: its tables keep batched deletes.
 *
 * Each table also gets a catch-all partition (Postgres DEFAULT, MariaDB `pmax` up to MAXVALUE), so inserts never fail
 * when maintenance has fallen behind; a later maintenance run moves such days into partitions of their own (MariaDB)
 * or deletes the expired rows from it (Postgres). On Postgres a day whose rows are already in the DEFAULT partition
 * cannot get a partition of its own (the failure is reported); its rows stay there until they expire.
 *
 * A partitioned table cannot have foreign keys (MariaDB), and every unique key must include the partition column.
 */
export interface PartitionSpec {
  table: string;
  /** DateTime column the table is partitioned by (part of every unique key, the primary key included). */
  column: string;
}

export const PARTITIONED_TABLES: readonly PartitionSpec[] = [
  { table: 'StepTrace', column: 'createdAt' },
  { table: 'BusEvent', column: 'createdAt' },
  { table: 'LlmCall', column: 'createdAt' },
  { table: 'LlmTelemetry', column: 'createdAt' },
];

export interface PartitionOptions {
  /** Days kept: partitions whose day ended more than this many days ago are dropped. */
  retainDays: number;
  /** Days ahead of today that get their partition in advance. Default 2. */
  aheadDays?: number;
  now?: Date;
}

export interface PartitionResult {
  converted: string[];
  created: string[];
  dropped: string[];
  /** Tables that could not be converted automatically (e.g. a non-empty Postgres table). */
  manual: Array<{ table: string; reason: string }>;
  failed: Array<{ sql: string; error: string }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DAY_PARTITION = /_?p(\d{8})$/;

const emptyResult = (): PartitionResult => ({ converted: [], created: [], dropped: [], manual: [], failed: [] });

function checkIdentifiers(spec: PartitionSpec): void {
  for (const name of [spec.table, spec.column]) {
    if (!IDENTIFIER.test(name)) throw new Error(`[partitions] Invalid identifier '${name}'`);
  }
}

const quote = (db: SchemaDb, name: string) => (db.dialect === 'mysql' ? `\`${name}\`` : `"${name}"`);
const dayStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const dayKey = (day: Date) => day.toISOString().slice(0, 10).replace(/-/g, '');
const dayLiteral = (day: Date) => `'${day.toISOString().slice(0, 10)} 00:00:00'`;
const keyDay = (key: string) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))));
const postgresPartition = (spec: PartitionSpec, day: Date) => `${spec.table}_p${dayKey(day)}`;

/** True when `spec.table` is already a partitioned table. */
export async function isPartitioned(db: SchemaDb, spec: PartitionSpec): Promise<boolean> {
  checkIdentifiers(spec);
  if (db.dialect === 'sqlite') return false;
  if (db.dialect === 'postgresql') {
    const rows = await db.query(
      `SELECT c.relkind::text AS kind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND c.relname = '${spec.table}'`
    );
    return rows[0]?.kind === 'p';
  }
  const rows = await db.query(
    `SELECT COUNT(*) AS n FROM information_schema.PARTITIONS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${spec.table}' AND PARTITION_NAME IS NOT NULL`
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Day partitions of a partitioned table (UTC day starts), and whether its catch-all partition exists. */
async function listPartitions(db: SchemaDb, spec: PartitionSpec): Promise<{ days: Date[]; catchAll: boolean }> {
  const names: string[] =
    db.dialect === 'postgresql'
      ? (
          await db.query(
            `SELECT c.relname AS name FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent JOIN pg_namespace n ON n.oid = p.relnamespace WHERE n.nspname = current_schema() AND p.relname = '${spec.table}'`
          )
        ).map((r: any) => String(r.name))
      : (
          await db.query(
            `SELECT PARTITION_NAME AS name FROM information_schema.PARTITIONS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${spec.table}' AND PARTITION_NAME IS NOT NULL`
          )
        ).map((r: any) => String(r.name ?? r.NAME ?? r.PARTITION_NAME));
  const days = names.map(n => n.match(DAY_PARTITION)?.[1]).filter((k): k is string => Boolean(k)).map(keyDay);
  const catchAll = names.some(n => (db.dialect === 'postgresql' ? n === `${spec.table}_default` : n === 'pmax'));
  return { days, catchAll };
}

/** The days that should have a partition now: yesterday through `aheadDays` ahead. */
function wantedDays(now: Date, aheadDays: number): Date[] {
  const today = dayStart(now);
  const days: Date[] = [];
  for (let offset = -1; offset <= aheadDays; offset++) days.push(new Date(today.getTime() + offset * DAY_MS));
  return days;
}

async function run(db: SchemaDb, result: PartitionResult, sql: string): Promise<boolean> {
  try {
    await db.exec(sql);
    return true;
  } catch (err: any) {
    const error = String(err?.message ?? err);
    // Another node did the same step first
    if (!/already exists|does not exist|duplicate|unknown partition|error in list of partitions/i.test(error)) result.failed.push({ sql, error });
    return false;
  }
}

/**
 * Turns each listed table into a partitioned one, if it is not yet, and creates its first partitions. Postgres
 * cannot partition a table in place: an empty table is recreated from the generated schema.sql (columns, keys and
 * index names unchanged); a non-empty one is reported for a manual migration. MariaDB converts in place. Call it
 * after `convergeSchema`, on one session, while holding the schema lock (one node at a time).
 */
export async function convergePartitions(
  db: SchemaDb,
  options: Omit<PartitionOptions, 'retainDays'> = {},
  specs: readonly PartitionSpec[] = PARTITIONED_TABLES
): Promise<PartitionResult> {
  const result = emptyResult();
  if (db.dialect === 'sqlite') return result;
  const now = options.now ?? new Date();
  const days = wantedDays(now, options.aheadDays ?? 2);
  for (const spec of specs) {
    checkIdentifiers(spec);
    if (await isPartitioned(db, spec)) continue;
    const table = quote(db, spec.table);
    const column = quote(db, spec.column);

    if (db.dialect === 'mysql') {
      const partitions = [
        ...days.map(day => `PARTITION p${dayKey(day)} VALUES LESS THAN (${dayLiteral(new Date(day.getTime() + DAY_MS))})`),
        'PARTITION pmax VALUES LESS THAN (MAXVALUE)',
      ];
      // The first day partition also takes everything before it
      if (await run(db, result, `ALTER TABLE ${table} PARTITION BY RANGE COLUMNS(${column}) (${partitions.join(', ')})`)) {
        result.converted.push(spec.table);
        result.created.push(...days.map(day => `p${dayKey(day)}`));
      }
      continue;
    }

    const rows = await db.query(`SELECT 1 AS one FROM ${table} LIMIT 1`);
    if (rows.length) {
      result.manual.push({ table: spec.table, reason: 'Postgres cannot partition a table with rows in place' });
      continue;
    }
    const statements = parseSchemaSql(readSchemaSql('postgresql'));
    const create = statements.find(s => s.kind === 'table' && s.table === spec.table);
    if (!create) {
      result.manual.push({ table: spec.table, reason: 'not in prisma-postgres/schema.sql' });
      continue;
    }
    const indexes = statements.filter(s => s.kind === 'index' && s.table === spec.table).map(s => s.sql);
    try {
      await db.exec('BEGIN');
      await db.exec(`DROP TABLE ${table}`);
      await db.exec(`${create.sql} PARTITION BY RANGE (${column})`);
      for (const index of indexes) await db.exec(index);
      await db.exec(`CREATE TABLE ${quote(db, `${spec.table}_default`)} PARTITION OF ${table} DEFAULT`);
      await db.exec('COMMIT');
    } catch (err: any) {
      await db.exec('ROLLBACK').catch(() => {});
      result.failed.push({ sql: `partition ${spec.table}`, error: String(err?.message ?? err) });
      continue;
    }
    result.converted.push(spec.table);
    const created = await ensureDayPartitions(db, spec, days, result);
    result.created.push(...created);
  }
  return result;
}

/** Creates the missing day partitions among `days`; returns the names created. */
async function ensureDayPartitions(db: SchemaDb, spec: PartitionSpec, days: Date[], result: PartitionResult): Promise<string[]> {
  const { days: existing } = await listPartitions(db, spec);
  const have = new Set(existing.map(dayKey));
  const created: string[] = [];
  const table = quote(db, spec.table);
  for (const day of days) {
    if (have.has(dayKey(day))) continue;
    const next = new Date(day.getTime() + DAY_MS);
    if (db.dialect === 'postgresql') {
      const name = postgresPartition(spec, day);
      if (await run(db, result, `CREATE TABLE IF NOT EXISTS ${quote(db, name)} PARTITION OF ${table} FOR VALUES FROM (${dayLiteral(day)}) TO (${dayLiteral(next)})`)) {
        created.push(name);
      }
    } else {
      // Days are only ever added after the last one: split them off the catch-all partition
      if (existing.length && day.getTime() <= Math.max(...existing.map(d => d.getTime()))) continue;
      const name = `p${dayKey(day)}`;
      if (await run(db, result, `ALTER TABLE ${table} REORGANIZE PARTITION pmax INTO (PARTITION ${name} VALUES LESS THAN (${dayLiteral(next)}), PARTITION pmax VALUES LESS THAN (MAXVALUE))`)) {
        created.push(name);
        existing.push(day);
      }
    }
  }
  return created;
}

/**
 * Runtime upkeep of partitioned tables (a maintenance system calls it about hourly; any node may, concurrent runs are
 * harmless): creates the partitions of the coming days and drops those whose day ended more than `retainDays` ago.
 * Tables that are not partitioned are left alone (the caller deletes their rows instead).
 */
export async function maintainPartitions(
  db: SchemaDb,
  options: PartitionOptions,
  specs: readonly PartitionSpec[] = PARTITIONED_TABLES
): Promise<PartitionResult> {
  const result = emptyResult();
  if (db.dialect === 'sqlite') return result;
  const now = options.now ?? new Date();
  const cutoff = new Date(dayStart(now).getTime() - options.retainDays * DAY_MS);
  for (const spec of specs) {
    checkIdentifiers(spec);
    if (!(await isPartitioned(db, spec))) continue;
    result.created.push(...(await ensureDayPartitions(db, spec, wantedDays(now, options.aheadDays ?? 2), result)));
    const { days } = await listPartitions(db, spec);
    const table = quote(db, spec.table);
    for (const day of days) {
      if (day.getTime() + DAY_MS > cutoff.getTime()) continue;
      const name = db.dialect === 'postgresql' ? postgresPartition(spec, day) : `p${dayKey(day)}`;
      const sql = db.dialect === 'postgresql' ? `DROP TABLE IF EXISTS ${quote(db, name)}` : `ALTER TABLE ${table} DROP PARTITION ${name}`;
      if (await run(db, result, sql)) result.dropped.push(name);
    }
    if (db.dialect === 'postgresql') {
      // Rows that landed in the catch-all partition while maintenance lagged
      await run(db, result, `DELETE FROM ${quote(db, `${spec.table}_default`)} WHERE ${quote(db, spec.column)} < ${dayLiteral(cutoff)}`);
    }
  }
  return result;
}

/** Logs what `convergePartitions` did (provisioner startup output). */
export function reportPartitions(source: string, result: PartitionResult): void {
  if (result.converted.length) console.log(`[${source}] Schema: partitioned ${result.converted.join(', ')} by day`);
  for (const manual of result.manual) console.warn(`[${source}] ${manual.table} not partitioned (needs a manual migration): ${manual.reason}`);
  for (const failure of result.failed) console.warn(`[${source}] Partition statement failed: ${failure.error}\n  ${failure.sql}`);
}
