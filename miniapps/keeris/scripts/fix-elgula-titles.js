import pg from 'pg';
import * as cheerio from 'cheerio';
import { parseEpisodeText } from '../src/episode-parser.js';

async function fixTitlesAndDates() {
  const client = new pg.Client('postgresql://curator:curator_secret@192.168.1.110:5432/keeris');
  await client.connect();

  console.log('Fixing episode titles for "Stuudios on Jaan Elgula"...');
  const eps = await client.query(`
    SELECT id, url, title FROM episodes WHERE program_id = 4102 OR title = 'Episode'
  `);

  console.log(`Found ${eps.rows.length} episodes to verify.`);

  for (const ep of eps.rows) {
    try {
      const res = await fetch(ep.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      
      let title = $('h1').text().trim();
      // Remove any trailing button text if glued
      title = title.split('\n')[0].trim();
      if (title.length > 80) {
        title = title.replace(/(Meedia|Päevaküsimus|Kuula eelmisi|Saate muusika).*/i, '').trim();
      }
      if (!title || title.length < 3) title = 'Stuudios on Jaan Elgula';

      await client.query(`
        UPDATE episodes
        SET title = $1, fetched_at = NOW()
        WHERE id = $2
      `, [title, ep.id]);
      console.log(`Updated ${ep.id}: "${title}"`);
    } catch (e) {
      console.error(`Error on ${ep.id}:`, e.message);
    }
  }

  await client.query(`UPDATE programs SET updated_at = NOW() WHERE id = 4102 OR id = 29`);

  console.log('\n=== Updated Status for Program 4102 & 29 ===');
  const res = await client.query(`
    SELECT p.id, p.title, COUNT(e.id) as ep_count, MAX(e.fetched_at) as max_fetched, p.updated_at
    FROM programs p
    LEFT JOIN episodes e ON e.program_id = p.id
    WHERE p.id IN (4102, 29)
    GROUP BY p.id, p.title, p.updated_at
  `);
  console.table(res.rows);

  await client.end();
}

fixTitlesAndDates().catch(console.error);
