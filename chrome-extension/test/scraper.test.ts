import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { SCHEMA_DDL } from '../src/adapter/schema.ts';
import {
  checkPageScrapeStatus,
  persistSemanticScrape
} from '../src/scraper/semanticScraper.ts';

test('semanticScraper stores Resource, Text, Relations, and ArticleShape in SQLite', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(SCHEMA_DDL);

  const testUrl = 'https://news.ycombinator.com/item?id=12345';

  // 1. Initially unscraped
  const initialStatus = checkPageScrapeStatus(db, testUrl);
  assert.equal(initialStatus.status, 'UNSCRAPED');

  // 2. Perform semantic scrape and persistence
  const result = await persistSemanticScrape(
    db,
    {
      url: testUrl,
      title: 'Show HN: Curator Knowledge Studio',
      text: '# Curator Knowledge Studio\nAn intelligent knowledge graph inside your browser.',
      meta: {
        'description': 'A semantic client-side knowledge graph inside Chrome',
        'author': 'Joel Arula',
        'og:site_name': 'Hacker News',
      },
    },
    'default',
    'curator-extension-user'
  );

  assert.ok(result.resourceId > 0);
  assert.equal(result.title, 'Show HN: Curator Knowledge Studio');
  assert.equal(result.relationsCount >= 3, true); // type (ArticleShape) + author + publisher

  // 3. Verify Resource row in database
  const resStmt = db.prepare('SELECT id, uri, title, description FROM "Resource" WHERE id = ?');
  resStmt.bind([result.resourceId]);
  assert.equal(resStmt.step(), true);
  const resourceRow = resStmt.getAsObject();
  resStmt.free();
  assert.equal(resourceRow.uri, testUrl);
  assert.equal(resourceRow.title, 'Show HN: Curator Knowledge Studio');

  // 4. Verify Text row in database
  const txtStmt = db.prepare('SELECT id, resourceId, content, role, mimeType FROM "Text" WHERE resourceId = ?');
  txtStmt.bind([result.resourceId]);
  assert.equal(txtStmt.step(), true);
  const textRow = txtStmt.getAsObject();
  txtStmt.free();
  assert.equal(textRow.role, 'MAIN');
  assert.equal(textRow.mimeType, 'text/markdown');
  assert.ok(String(textRow.content).includes('Curator Knowledge Studio'));

  // 5. Verify Relation triples (hasAuthor, hasPublisher, rdf:type)
  const relStmt = db.prepare('SELECT count(*) as count FROM "Relation" WHERE subjectId = ?');
  relStmt.bind([result.resourceId]);
  relStmt.step();
  const relCount = Number(relStmt.getAsObject().count);
  relStmt.free();
  assert.equal(relCount >= 3, true);

  // 6. Verify checkPageScrapeStatus now returns SCRAPED
  const updatedStatus = checkPageScrapeStatus(db, testUrl);
  assert.equal(updatedStatus.status, 'SCRAPED');
  assert.equal(updatedStatus.resourceId, result.resourceId);
  assert.equal(updatedStatus.title, 'Show HN: Curator Knowledge Studio');

  // 7. Re-scraping the same URL updates existing Resource without duplicating
  const secondResult = await persistSemanticScrape(
    db,
    {
      url: testUrl,
      title: 'Show HN: Curator Knowledge Studio (Updated)',
      text: 'Updated article content.',
      meta: {
        'description': 'Updated description',
        'author': 'Joel Arula',
      },
    },
    'default',
    'curator-extension-user'
  );

  assert.equal(secondResult.resourceId, result.resourceId); // Same resource ID
  const checkUpdated = checkPageScrapeStatus(db, testUrl);
  assert.equal(checkUpdated.title, 'Show HN: Curator Knowledge Studio (Updated)');
});
