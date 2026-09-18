import { existsSync, copyFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_DDL } from '../wasm/generated-schema.js';
import { PROGRAM_MANIFEST } from '../wasm/wasm-curator-engine.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, 'data');
const targetDbPath = join(dataDir, 'keeris-seed.sqlite3');
const targetKeerisDb = join(dataDir, 'keeris.db');

mkdirSync(dataDir, { recursive: true });

// Backup existing big database if not already backed up
if (existsSync(targetKeerisDb) && !existsSync(join(dataDir, 'keeris-archive-full.db'))) {
  copyFileSync(targetKeerisDb, join(dataDir, 'keeris-archive-full.db'));
  console.log('[Clean Seed] Backed up full archive to data/keeris-archive-full.db');
}

// Remove current seed file if exists
if (existsSync(targetDbPath)) {
  unlinkSync(targetDbPath);
}

const db = new DatabaseSync(targetDbPath);

console.log('[Clean Seed] Initializing Prisma-generated schema tables...');
db.exec(SCHEMA_DDL);

// Initial Baseline Setup
db.exec(`
  INSERT OR IGNORE INTO users (id, name, email) VALUES ('1', 'System User', 'system@local');
  INSERT OR IGNORE INTO projects (id, name, user_id) VALUES ('1', 'Keeris', '1');
  INSERT OR IGNORE INTO conversations (id, user_id, project_id) VALUES ('1', '1', '1');
`);

// Insert all programs and agents from PROGRAM_MANIFEST
const insertProgramStmt = db.prepare(`
  INSERT OR IGNORE INTO programs (series_id, title, created_at, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

const insertScriptStmt = db.prepare(`
  INSERT OR IGNORE INTO scripts (id, name, description, ast, created_at)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

const insertAgentStmt = db.prepare(`
  INSERT OR IGNORE INTO agents (id, name, script_id, schedule, is_active, created_at)
  VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
`);

for (const [agentId, def] of Object.entries(PROGRAM_MANIFEST)) {
  insertProgramStmt.run(String(def.seriesContentId), def.programTitle);

  const scriptId = `script_${agentId}`;
  const scriptAst = JSON.stringify({
    type: 'Sequence',
    steps: [
      {
        type: 'ToolTask',
        tool: 'vikerraadio_discover_episodes',
        args: { seriesContentId: String(def.seriesContentId), limit: 50 },
        as: 'discovery'
      },
      {
        type: 'ForEach',
        collection: '{{discovery.data}}',
        iterator: 'episode',
        body: {
          type: 'ToolTask',
          tool: 'vikerraadio_process_episode',
          args: {
            url: '{{episode.url}}',
            episode: '{{episode}}',
            program: { seriesId: String(def.seriesContentId), title: def.programTitle }
          }
        }
      }
    ]
  });

  insertScriptStmt.run(scriptId, `${def.programTitle} Workflow`, `Automated scraper for ${def.programTitle}`, scriptAst);
  insertAgentStmt.run(agentId, def.programTitle, scriptId, '0 0 * * *');
}

const ep = db.prepare('SELECT COUNT(*) as c FROM episodes').get();
const tr = db.prepare('SELECT COUNT(*) as c FROM tracks').get();
const ag = db.prepare('SELECT COUNT(*) as c FROM agents').get();
const pr = db.prepare('SELECT COUNT(*) as c FROM programs').get();
db.close();

console.log(`[Clean Seed] Virgin database created successfully at ${targetDbPath}!`);
console.log(`[Clean Seed] Stats: ${pr.c} programs, ${ag.c} agents, ${ep.c} episodes, ${tr.c} tracks (Clean Virgin DB)`);
