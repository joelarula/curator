import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { RADIO_PROGRAMS, buildPipelineScrapeAST } from '../src/plugins/manifest.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const keerisRoot = path.resolve(__dirname, '..');

for (const envPath of [path.join(keerisRoot, '.env'), path.join(keerisRoot, '.env.local')]) {
  if (fs.existsSync(envPath)) {
    try { process.loadEnvFile(envPath); break; } catch (_) {}
  }
}

async function main() {
  console.log('================================================================');
  console.log('       Seeding "Serenaad" Program & Agent in Keeris            ');
  console.log('================================================================');

  const serenaadDef = RADIO_PROGRAMS['klassikaraadio_serenaad_scrape'];
  console.log('Program Definition:');
  console.log('  Title          :', serenaadDef.programTitle);
  console.log('  Series ID/URL  :', serenaadDef.seriesContentId);
  console.log('  Schedule       :', serenaadDef.schedule);
  console.log('  Enabled        :', serenaadDef.enabled);

  const dbUrl = process.env.DATABASE_URL || 'mysql://curator:curator_secret@192.168.1.110:3306/keeris';
  const curatorUrl = process.env.CURATOR_DATABASE_URL || 'mysql://curator:curator_secret@192.168.1.110:3306/curator';

  // 1. Seed in Keeris DB
  console.log('\n[1/2] Connecting to Keeris DB...');
  const keerisConn = await mysql.createConnection(dbUrl);
  await keerisConn.query(`
    INSERT INTO programs (series_id, title, slug, description, url)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE title = VALUES(title), slug = VALUES(slug), description = VALUES(description), url = VALUES(url)
  `, [
    serenaadDef.seriesContentId,
    serenaadDef.programTitle,
    'serenaad',
    'Klassikaraadio saatesari: Meloodiaid videvikutunniks.',
    'https://klassikaraadio.err.ee/arhiiv/serenaad'
  ]);
  const [progRows] = await keerisConn.query('SELECT * FROM programs WHERE slug = ? OR title = ?', ['serenaad', 'Serenaad']);
  console.log('  ✓ Program seeded in Keeris DB:', progRows[0]?.id, progRows[0]?.title);
  await keerisConn.end();

  // 2. Seed in Curator Orchestration DB
  console.log('\n[2/2] Connecting to Curator DB...');
  const curatorConn = await mysql.createConnection(curatorUrl);

  const agentName = 'klassikaraadio_serenaad_scrape';
  const ast = JSON.stringify(buildPipelineScrapeAST(serenaadDef));

  // Upsert Script
  await curatorConn.query(`
    INSERT INTO Script (name, body, ast, userId, projectId, existent, createdAt)
    VALUES (?, ?, ?, '1', '1', 1, NOW())
    ON DUPLICATE KEY UPDATE body = VALUES(body), ast = VALUES(ast)
  `, [
    agentName,
    `// Keeris workflow for ${serenaadDef.programTitle}`,
    ast
  ]);
  console.log(`  ✓ Script '${agentName}' seeded.`);

  const [scriptRows] = await curatorConn.query('SELECT id FROM Script WHERE name = ?', [agentName]);
  const scriptId = scriptRows[0]?.id;

  // Upsert Agent
  const agentId = `agent_${agentName}`;
  await curatorConn.query(`
    INSERT INTO Agent (id, name, scriptId, userId, projectId, enabled, schedule, existent, createdAt, updatedAt)
    VALUES (?, ?, ?, '1', '1', ?, ?, 1, NOW(), NOW())
    ON DUPLICATE KEY UPDATE scriptId = VALUES(scriptId), schedule = VALUES(schedule), enabled = VALUES(enabled), updatedAt = NOW()
  `, [
    agentId,
    agentName,
    scriptId,
    serenaadDef.enabled ? 1 : 0,
    serenaadDef.schedule
  ]);
  console.log(`  ✓ Agent '${agentName}' seeded.`);

  const [agentRows] = await curatorConn.query('SELECT id, name, schedule, enabled FROM Agent WHERE name = ?', [agentName]);
  console.log('\n================================================================');
  console.log('✓ SEEDING COMPLETE!');
  console.log('Agent Record in Curator DB:');
  console.log(agentRows[0]);
  console.log('================================================================\n');

  await curatorConn.end();
}

main().catch(console.error);
