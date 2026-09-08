import { openDatabase } from '../src/db.js';
import { ErrClient } from '../src/err-client.js';
import { scrape } from '../src/scrape.js';

async function runSoovideAegScrape() {
  const db = openDatabase('postgresql://curator:curator_secret@192.168.1.110:5432/keeris');
  const client = new ErrClient();

  console.log('Running scrape for "Soovide aeg" (seriesContentId 1038019)...');
  const result = await scrape({
    client,
    db,
    seriesContentId: '1038019',
    programTitle: 'Soovide aeg',
    refresh: false,
    logger: console
  });

  console.log('Scrape result:', JSON.stringify(result, null, 2));
  db.close();
}

runSoovideAegScrape().catch(console.error);
