import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db.js';
import { scrape } from '../src/scrape.js';
import { keerisDomainPlugin } from '../src/plugins/keeris-domain.js';

test('Keeris exposes Vikerraadio and Klassikaraadio program agent workflows', () => {
  assert.equal(keerisDomainPlugin.agents.vikerraadio_kauamangiv_scrape.toolName, 'vikerraadio_scrape');
  assert.equal(keerisDomainPlugin.agents.vikerraadio_originaal_ja_koopia_scrape.toolName, 'vikerraadio_scrape');
  assert.equal(keerisDomainPlugin.agents.vikerraadio_originaal_ja_koopia_scrape.args.seriesContentId, '1037950');
  assert.equal(keerisDomainPlugin.agents.klassikaraadio_fantaasia_scrape.args.seriesContentId, '1038126');
});

test('recurring scrape skips episodes already indexed and parses show text metadata', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'keeris-'));
  const db = openDatabase(join(directory, 'test.sqlite'));
  const calls = [];
  const client = {
    async archive() {
      return { data: [{ id: 1, url: 'https://vikerraadio.err.ee/1/episode', heading: 'Episode', scheduleStart: 1 }], previous: null };
    },
    async episode(url) {
      calls.push(url);
      return '<article><p class="lead">Shows historical original and copy tracks.</p><div class="music-list-item"><span class="music-artist">Keeris</span><span class="music-title">Example</span></div></article>';
    },
  };

  await scrape({ client, db, seriesContentId: '1037950', programTitle: 'Originaal ja koopia', logger: { log() {}, error() {} } });
  await scrape({ client, db, seriesContentId: '1037950', programTitle: 'Originaal ja koopia', logger: { log() {}, error() {} } });

  assert.equal(calls.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM episodes').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM tracks').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM programs').get().count, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM unique_tracks').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM episode_metadata').get().count, 1);
  db.close();
});