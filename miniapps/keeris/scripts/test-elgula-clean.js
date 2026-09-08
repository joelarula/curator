import * as cheerio from 'cheerio';
import { parseMusicList, parseEpisodeText, parseEpisodeDate } from '../src/episode-parser.js';

async function test() {
  const url = 'https://vikerraadio.err.ee/817942/stuudios-on-jaan-elgula-2-tund/818433';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);

  console.log('Title:', $('h1').text().trim());
  console.log('Date:', parseEpisodeDate(html));
  const tracks = parseMusicList(html);
  console.log('Tracks count:', tracks.length);
  console.log('Tracks:', tracks);
}

test().catch(console.error);
