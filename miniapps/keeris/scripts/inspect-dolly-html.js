import * as cheerio from 'cheerio';
import { parseMusicList } from '../src/episode-parser.js';

async function inspectPage() {
  const url = 'https://vikerraadio.err.ee/1230097/kantri-alati-jaab-dolly-parton-75';
  console.log('Fetching:', url);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  console.log(`Received ${html.length} bytes.`);

  const parsedTracks = parseMusicList(html);
  console.log('Parsed result:');
  console.log('- tracks count:', parsedTracks.length);
  console.log('- tracks:', parsedTracks);

  const $ = cheerio.load(html);
  console.log('\n--- All text blocks ---');
  $('p, div.text, div.content, div.body, div.article, div.lead, article').each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes('Dolly') || text.includes('Võõras') || text.includes('Karavan') || text.includes('Jolene')) {
      console.log(`[Block ${i} <${el.tagName} class="${$(el).attr('class')}">]:\n`, text);
    }
  });
}

inspectPage().catch(console.error);
