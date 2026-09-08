import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, 'data');
const candidates = [
  join(dataDir, 'keeris.db'),
  join(dataDir, 'kauamangiv.sqlite'),
  join(dataDir, 'keeris.sqlite3'),
];

const targetDbPath = join(dataDir, 'keeris-seed.sqlite3');

mkdirSync(dataDir, { recursive: true });

let sourceDbPath = null;
for (const cand of candidates) {
  if (existsSync(cand)) {
    sourceDbPath = cand;
    break;
  }
}

if (sourceDbPath) {
  copyFileSync(sourceDbPath, targetDbPath);
  
  // Ensure Curator AST agent tables exist in the seed
  const db = new DatabaseSync(targetDbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      ast TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      script_id TEXT REFERENCES scripts(id) ON DELETE SET NULL,
      schedule TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      script_id TEXT REFERENCES scripts(id),
      ast TEXT NOT NULL,
      context TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO users (id, name, email) VALUES ('1', 'System User', 'system@local');
    INSERT OR IGNORE INTO projects (id, name, user_id) VALUES ('1', 'Keeris', '1');
    INSERT OR IGNORE INTO conversations (id, user_id, project_id) VALUES ('1', '1', '1');

    INSERT OR IGNORE INTO scripts (id, name, description, ast)
    VALUES 
      ('script-1', 'Kauamängiv Scraper Script', 'Indexes Kauamängiv tracks', '{"type":"Sequence","children":[{"type":"ToolTask","name":"keeris.index_unique_tracks"}]}'),
      ('script-2', 'Vanamuusikatund Scraper Script', 'Indexes Vanamuusikatund tracks', '{"type":"Sequence","children":[{"type":"ToolTask","name":"vanamuusikatund.index_unique_tracks"}]}'),
      ('script-3', 'Soovide Aeg Scraper Script', 'Indexes Soovide Aeg tracks', '{"type":"Sequence","children":[{"type":"ToolTask","name":"soovide_aeg.index_unique_tracks"]}');

    INSERT OR IGNORE INTO agents (id, name, script_id, schedule, is_active)
    VALUES 
      ('agent-1', 'Kauamängiv Scraper Agent', 'script-1', '0 * * * *', 1),
      ('agent-2', 'Vanamuusikatund Scraper Agent', 'script-2', '30 * * * *', 0),
      ('agent-3', 'Soovide Aeg Scraper Agent', 'script-3', '15 * * * *', 1);
  `);

  const ep = db.prepare('SELECT COUNT(*) as c FROM episodes').get();
  const tr = db.prepare('SELECT COUNT(*) as c FROM tracks').get();
  db.close();

  console.log(`[Seed Export] Successfully exported ${sourceDbPath} -> ${targetDbPath} (${ep.c} episodes, ${tr.c} tracks)`);
} else {
  console.error('[Seed Export] No source SQLite database found in data/ directory!');
}
