import * as cheerio from 'cheerio';
import { parseMusicList, parseEpisodeText, parseEpisodeDate } from '../src/episode-parser.js';

async function inspectHtml() {
  const url = 'https://vikerraadio.err.ee/817942/stuudios-on-jaan-elgula-2-tund/818433';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);

  console.log('Title:', $('h1').text().trim());
  console.log('Breadcrumbs/Series:', $('.breadcrumb, .header-category, .program-title, .series-title').text().trim());
  console.log('Date parsed:', parseEpisodeDate(html));
  
  const tracks = parseMusicList(html);
  console.log('Tracks count:', tracks.length);
  console.log('Tracks sample:', JSON.stringify(tracks.slice(0, 5), null, 2));

  const text = parseEpisodeText(html);
  console.log('Description:', text.description);
  console.log('FullText length:', text.fullText?.length);

  // Look for series ID or other episode links in HTML
  $('a[href*="stuudios-on-jaan-elgula"]').each((i, el) => {
    console.log(`Link ${i}:`, $(el).attr('href'), $(el).text().trim());
  });

  // Check script data
  $('script').each((i, el) => {
    const content = $(el).html() || '';
    if (content.includes('817942') || content.includes('818433') || content.includes('categoryId') || content.includes('seriesId')) {
      console.log(`Script ${i} length ${content.length}:`);
      const matches = content.match(/.*(categoryId|seriesId|programId|contentId).*/gi);
      if (matches) console.log(matches.slice(0, 5));
    }
  });
}

inspectHtml().catch(console.error);
