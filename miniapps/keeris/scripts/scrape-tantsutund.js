import { openDatabase } from '../src/db.js';
import { ErrClient } from '../src/err-client.js';
import { scrape } from '../src/scrape.js';

async function run() {
  const db = openDatabase('postgresql://curator:curator_secret@192.168.1.110:5432/keeris');
  const client = new ErrClient({ baseUrl: 'https://klassikaraadio.err.ee', requestDelayMs: 400 });

  console.log('Running scrape for "Tantsutund" (seriesContentId 1038102)...');
  const result = await scrape({
    client,
    db,
    seriesContentId: '1038102',
    programTitle: 'Tantsutund',
    refresh: false,
    logger: console,
  });

  console.log('Scrape result:', JSON.stringify(result, null, 2));
  db.close();
}

run().catch(console.error);
