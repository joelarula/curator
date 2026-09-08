import pg from 'pg';
import { openDatabase } from '../src/db.js';
import { ErrClient } from '../src/err-client.js';
import { scrape } from '../src/scrape.js';

async function runElgulaScrape() {
  const db = openDatabase('postgresql://curator:curator_secret@192.168.1.110:5432/keeris');
  const client = new ErrClient();

  console.log('Running scrape for "Stuudios on Jaan Elgula"...');
  const result = await scrape({
    client,
    db,
    seriesContentId: 'https://vikerraadio.err.ee/817942/stuudios-on-jaan-elgula-2-tund/818433',
    programTitle: 'Stuudios on Jaan Elgula',
    refresh: false,
    logger: console
  });

  console.log('Scrape result:', JSON.stringify(result, null, 2));
  db.close();
}

runElgulaScrape().catch(console.error);
