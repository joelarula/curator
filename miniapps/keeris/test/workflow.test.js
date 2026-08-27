import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db.js';
import { scrape } from '../src/scrape.js';
import { keerisDomainPlugin } from '../src/plugins/keeris-domain.js';

test('Keeris exposes separate deterministic scrape and migration workflows', () => {
  assert.equal(keerisDomainPlugin.agents.keeris_kauamangiv_scrape.toolName, 'keeris_scrape');
  assert.equal(keerisDomainPlugin.agents.keeris_legacy_migration.toolName, 'keeris_migrate_legacy');
});

test('recurring scrape skips episodes already indexed', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'keeris-'));
  const db = openDatabase(join(directory, 'test.sqlite'));
  const calls = [];
  const client = {
    async archive() {
      return { data: [{ id: 1, url: 'https://vikerraadio.err.ee/1/episode', heading: 'Episode', scheduleStart: 1 }], previous: null };
    },
    async episode(url) {
      calls.push(url);
      return '<section><div class="music-list-item"><span class="music-artist">Keeris</span><span class="music-title">Example</span></div></section>';
    },
  };

  await scrape({ client, db, logger: { log() {}, error() {} } });
  await scrape({ client, db, logger: { log() {}, error() {} } });

  assert.equal(calls.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM episodes').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tracks').get().count, 1);
  db.close();
});