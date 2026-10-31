import test from 'node:test';
import assert from 'node:assert/strict';
import { sqlDialect, sqlTag, supportsSkipLocked } from '../../src/db/sqlDialect.ts';

const query = (dialect: 'sqlite' | 'mysql' | 'postgresql') =>
  sqlTag(dialect)`UPDATE "Request" SET "status" = 'DONE' WHERE "conversationId" = ${7} AND "id" IN (${[1, 2, 3]})`;

test('sqlite and postgres keep ANSI quotes; mysql gets backticks', () => {
  assert.equal(query('sqlite')[0], `UPDATE "Request" SET "status" = 'DONE' WHERE "conversationId" = ? AND "id" IN (?, ?, ?)`);
  assert.equal(query('mysql')[0], "UPDATE `Request` SET `status` = 'DONE' WHERE `conversationId` = ? AND `id` IN (?, ?, ?)");
  assert.equal(query('postgresql')[0], `UPDATE "Request" SET "status" = 'DONE' WHERE "conversationId" = $1 AND "id" IN ($2, $3, $4)`);
});

test('values are passed through in order and never rewritten', () => {
  const [, ...values] = sqlTag('mysql')`SELECT 1 WHERE "a" = ${'say "hi"'} AND "b" IN (${[1, 2]})`;
  assert.deepEqual(values, ['say "hi"', 1, 2]);
});

test('an empty list is rejected instead of producing IN ()', () => {
  assert.throws(() => sqlTag('sqlite')`SELECT 1 WHERE "id" IN (${[]})`, /Empty list/);
});

test('dialect comes from the Prisma provider', () => {
  assert.equal(sqlDialect({ _activeProvider: 'mysql' }), 'mysql');
  assert.equal(sqlDialect({ _activeProvider: 'postgresql' }), 'postgresql');
  assert.throws(() => sqlDialect({}), /Unsupported/);
  assert.equal(supportsSkipLocked('sqlite'), false);
  assert.equal(supportsSkipLocked('mysql'), true);
});
