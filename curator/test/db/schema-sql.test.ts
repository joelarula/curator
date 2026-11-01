import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { convergeSchema, parseSchemaSql, readSchemaSql, type SchemaDb } from '../../src/db/schemaSql.ts';
// @ts-ignore plain ESM script without type declarations
import { generateSchemaSql, SCHEMA_FOLDERS } from '../../scripts/generate-schema-sql.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const fileDb = (db: DatabaseSync): SchemaDb => ({
  dialect: 'sqlite',
  query: async sql => db.prepare(sql).all() as any[],
  exec: async sql => {
    db.exec(sql);
  },
});

test('schema sql: every committed schema.sql is what Prisma generates from its schema.prisma', () => {
  for (const folder of SCHEMA_FOLDERS as string[]) {
    const committed = fs.readFileSync(path.join(root, folder, 'schema.sql'), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(committed, generateSchemaSql(folder), `${folder}/schema.sql is stale: run npm --prefix curator run prisma:sql`);
  }
});

test('schema sql: a new SQLite database gets the whole schema, and converging again changes nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-sql-'));
  const db = new DatabaseSync(path.join(dir, 'fresh.db'));
  try {
    const tables = parseSchemaSql(readSchemaSql('sqlite')).filter(s => s.kind === 'table').length;
    const first = await convergeSchema(fileDb(db));
    assert.deepEqual(first.failed, []);
    assert.equal(first.createdTables.length, tables);

    const second = await convergeSchema(fileDb(db));
    assert.deepEqual(second, { createdTables: [], addedColumns: [], failed: [] });
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema sql: an older SQLite database gets its missing tables, columns and indexes added, data kept', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-sql-'));
  const db = new DatabaseSync(path.join(dir, 'old.db'));
  try {
    await convergeSchema(fileDb(db));
    db.exec(`INSERT INTO "User" ("id", "email", "updatedAt") VALUES ('u1', 'u1@example.com', CURRENT_TIMESTAMP)`);
    // An older database: no lease table, no googleId column, no conversation/status index on Request
    db.exec('DROP TABLE "ConversationLease"');
    db.exec('DROP INDEX "User_googleId_key"');
    db.exec('ALTER TABLE "User" DROP COLUMN "googleId"');
    db.exec('DROP INDEX "Request_conversationId_status_idx"');

    const result = await convergeSchema(fileDb(db));
    assert.deepEqual(result.failed, []);
    assert.deepEqual(result.createdTables, ['ConversationLease']);
    assert.deepEqual(result.addedColumns, ['User.googleId']);
    assert.ok(db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'Request_conversationId_status_idx'`).get());
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM "User"').get() as any).n, 1);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('schema sql: MariaDB keeps long text in TEXT columns and declares indexes and foreign keys', () => {
  const statements = parseSchemaSql(readSchemaSql('mysql'));
  const table = (name: string) => statements.find(s => s.kind === 'table' && s.table === name) as any;
  const column = (t: string, c: string) => table(t).columns.find((col: any) => col.name === c).definition;
  assert.match(column('Response', 'content'), /^LONGTEXT/);
  assert.match(column('Script', 'body'), /^LONGTEXT/);
  assert.match(column('Tool', 'description'), /^TEXT/);
  assert.ok(table('EventLog'), 'every Prisma model has a table');
  assert.ok(table('Request').inlineIndexes.some((i: any) => i.name === 'Request_conversationId_status_idx'));
  assert.ok(statements.some(s => s.kind === 'foreignKey' && s.table === 'Response'));
  assert.ok(parseSchemaSql(readSchemaSql('postgresql')).some(s => s.kind === 'other' && /CREATE TYPE "RequestStatus"/.test(s.sql)));
});
