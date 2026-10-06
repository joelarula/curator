import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db.ts';
import { ErrClient } from '../src/err-client.ts';
import { scrape } from '../src/scrape.ts';
import { RADIO_PROGRAMS } from '../src/plugins/manifest.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const keerisRoot = path.resolve(__dirname, '..');

for (const envPath of [path.join(keerisRoot, '.env'), path.join(keerisRoot, '.env.local')]) {
  if (fs.existsSync(envPath)) {
    try { process.loadEnvFile(envPath); break; } catch (_) {}
  }
}

async function run() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://curator:curator_secret@192.168.1.110:3306/keeris';
  console.log(`Connecting to Keeris DB (${dbUrl.replace(/:[^:@]+@/, ':****@')})...`);
  const db = openDatabase(dbUrl);
  const client = new ErrClient({ baseUrl: 'https://klassikaraadio.err.ee', requestDelayMs: 300 });

  const serenaadDef = RADIO_PROGRAMS['klassikaraadio_serenaad_scrape'];
  console.log(`Starting scrape for "${serenaadDef.programTitle}" (${serenaadDef.seriesContentId})...`);

  const result = await scrape({
    client,
    db,
    seriesContentId: serenaadDef.seriesContentId,
    programTitle: serenaadDef.programTitle,
    refresh: process.argv.includes('--refresh'),
    logger: console,
  });

  console.log('\nScrape Result:', JSON.stringify(result, null, 2));
  await db.close();
}

run().catch(console.error);
