/**
 * Curator Semantic Scrape Engine
 * Extracts webpage content and persists it into the active database using
 * Curator Core Schema: Resource, Text, Relation triples, and RDF ArticleShape.
 */

export interface ScrapeResult {
  resourceId: number;
  uri: string;
  title: string;
  description: string;
  relationsCount: number;
  textId: string;
}

export interface PageScrapeStatus {
  status: 'SCRAPED' | 'UNSCRAPED';
  resourceId?: number;
  title?: string;
  updatedAt?: string;
}

/**
 * Checks if a URL is already scraped in the active SQLite database
 */
export function checkPageScrapeStatus(db: any, url: string): PageScrapeStatus {
  if (!db || !url) return { status: 'UNSCRAPED' };

  try {
    const cleanUrl = url.split('#')[0]; // Ignore URL hashes
    const urlWithSlash = cleanUrl.endsWith('/') ? cleanUrl : `${cleanUrl}/`;
    const urlWithoutSlash = cleanUrl.endsWith('/') ? cleanUrl.slice(0, -1) : cleanUrl;

    const stmt = db.prepare(`
      SELECT id, title, updatedAt 
      FROM "Resource" 
      WHERE (uri = ? OR uri = ? OR uri = ?) AND existent = 1
      LIMIT 1
    `);
    stmt.bind([cleanUrl, urlWithSlash, urlWithoutSlash]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return {
        status: 'SCRAPED',
        resourceId: Number(row.id),
        title: String(row.title || ''),
        updatedAt: String(row.updatedAt || ''),
      };
    }
    stmt.free();
  } catch (err) {
    console.warn('[SemanticScraper] checkPageScrapeStatus query error:', err);
  }

  return { status: 'UNSCRAPED' };
}

/**
 * Ensure a system predicate resource exists and returns its ID
 */
function ensureResource(db: any, uri: string, title: string, projectId: string, userId = 'curator-extension-user'): number {
  const findStmt = db.prepare(`SELECT id FROM "Resource" WHERE uri = ? LIMIT 1`);
  findStmt.bind([uri]);
  if (findStmt.step()) {
    const id = Number(findStmt.getAsObject().id);
    findStmt.free();
    return id;
  }
  findStmt.free();

  db.run(`
    INSERT INTO "Resource" (uri, title, isPublished, userId, projectId, existent, createdAt, updatedAt)
    VALUES (?, ?, 1, ?, ?, 1, strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'))
  `, [uri, title, userId, projectId]);

  const lastIdStmt = db.prepare(`SELECT last_insert_rowid() as id`);
  lastIdStmt.step();
  const newId = Number(lastIdStmt.getAsObject().id);
  lastIdStmt.free();
  return newId;
}

/**
 * Ingests extracted page content into Resource, Text, Relation triples, and ArticleShape
 */
export async function persistSemanticScrape(
  db: any,
  data: {
    url: string;
    title: string;
    html?: string;
    text?: string;
    meta?: Record<string, string>;
  },
  projectId: string,
  userId = 'curator-extension-user'
): Promise<ScrapeResult> {
  if (!db) throw new Error('Database is not initialized.');

  const meta = data.meta || {};
  const cleanUrl = data.url.split('#')[0];
  const title = data.title || meta['og:title'] || meta['twitter:title'] || cleanUrl;
  const description = meta['description'] || meta['og:description'] || meta['twitter:description'] || '';
  const author = meta['author'] || meta['article:author'] || meta['twitter:creator'] || '';
  const siteName = meta['og:site_name'] || '';
  const textContent = data.text || '';

  // 1. Upsert Resource
  let resourceId: number;
  const existingStmt = db.prepare(`SELECT id FROM "Resource" WHERE uri = ? LIMIT 1`);
  existingStmt.bind([cleanUrl]);
  const exists = existingStmt.step();
  if (exists) {
    resourceId = Number(existingStmt.getAsObject().id);
    existingStmt.free();

    db.run(`
      UPDATE "Resource" 
      SET title = ?, description = ?, metadata = ?, updatedAt = strftime('%Y-%m-%d %H:%M:%f', 'now')
      WHERE id = ?
    `, [title, description, JSON.stringify(meta), resourceId]);
  } else {
    existingStmt.free();
    db.run(`
      INSERT INTO "Resource" (uri, title, description, isPublished, userId, projectId, metadata, existent, createdAt, updatedAt)
      VALUES (?, ?, ?, 1, ?, ?, ?, 1, strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'))
    `, [cleanUrl, title, description, userId, projectId, JSON.stringify(meta)]);

    const lastId = db.prepare(`SELECT last_insert_rowid() as id`);
    lastId.step();
    resourceId = Number(lastId.getAsObject().id);
    lastId.free();
  }

  // 2. Upsert Text (role: MAIN, mimeType: text/markdown)
  const textId = `txt_${resourceId}_main`;
  db.run(`
    INSERT OR REPLACE INTO "Text" (id, resourceId, content, role, mimeType, extension, userId, existent, createdAt, updatedAt)
    VALUES (?, ?, ?, 'MAIN', 'text/markdown', 'md', ?, 1, strftime('%Y-%m-%d %H:%M:%f', 'now'), strftime('%Y-%m-%d %H:%M:%f', 'now'))
  `, [textId, resourceId, textContent, userId]);

  // 3. Ensure Predicates & Create Semantic Relations (Triples)
  let relationsCount = 0;

  // Predicate: rdf:type
  const predType = ensureResource(db, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'rdf:type', projectId, userId);
  // Shape Object: ArticleShape
  const shapeArticle = ensureResource(db, 'https://curator.arula.dev/shapes/ArticleShape', 'ArticleShape', projectId, userId);

  // Link Resource -> rdf:type -> ArticleShape
  db.run(`
    INSERT OR IGNORE INTO "Relation" (subjectId, predicateId, objectId, projectId, existent, createdAt)
    VALUES (?, ?, ?, ?, 1, strftime('%Y-%m-%d %H:%M:%f', 'now'))
  `, [resourceId, predType, shapeArticle, projectId]);
  relationsCount++;

  // Predicate: schema:author (if author present)
  if (author && author.trim()) {
    const cleanAuthor = author.trim();
    const predAuthor = ensureResource(db, 'https://schema.org/author', 'schema:author', projectId, userId);
    const authorRes = ensureResource(db, `curator://person/${encodeURIComponent(cleanAuthor.toLowerCase())}`, cleanAuthor, projectId, userId);

    db.run(`
      INSERT OR IGNORE INTO "Relation" (subjectId, predicateId, objectId, projectId, existent, createdAt)
      VALUES (?, ?, ?, ?, 1, strftime('%Y-%m-%d %H:%M:%f', 'now'))
    `, [resourceId, predAuthor, authorRes, projectId]);
    relationsCount++;
  }

  // Predicate: schema:publisher (if siteName or domain present)
  let publisherDomain = siteName;
  if (!publisherDomain) {
    try {
      publisherDomain = new URL(cleanUrl).hostname;
    } catch {}
  }

  if (publisherDomain) {
    const predPublisher = ensureResource(db, 'https://schema.org/publisher', 'schema:publisher', projectId, userId);
    const publisherRes = ensureResource(db, `https://${publisherDomain}`, publisherDomain, projectId, userId);

    db.run(`
      INSERT OR IGNORE INTO "Relation" (subjectId, predicateId, objectId, projectId, existent, createdAt)
      VALUES (?, ?, ?, ?, 1, strftime('%Y-%m-%d %H:%M:%f', 'now'))
    `, [resourceId, predPublisher, publisherRes, projectId]);
    relationsCount++;
  }

  console.log(`[SemanticScraper] Scraped & indexed Resource #${resourceId} ("${title}") with ${relationsCount} semantic relations in project "${projectId}".`);

  return {
    resourceId,
    uri: cleanUrl,
    title,
    description,
    relationsCount,
    textId,
  };
}
