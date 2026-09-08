import * as cheerio from 'cheerio';
import { ErrClient } from '../src/err-client.js';

async function inspectSoovideAeg() {
  const client = new ErrClient();
  const url = 'https://vikerraadio.err.ee/arhiiv/soovide_aeg';
  console.log('Fetching:', url);

  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('Status:', res.status);
  const html = await res.text();
  console.log('HTML length:', html.length);

  const $ = cheerio.load(html);
  console.log('Title:', $('h1').text().trim() || $('title').text().trim());

  // Look for series / category / episode links
  const links = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && (href.includes('soovide') || href.includes('soov') || href.match(/\/\d+\//))) {
      const full = href.startsWith('http') ? href : `https://vikerraadio.err.ee${href.startsWith('/') ? '' : '/'}${href}`;
      links.add(`${full} | ${$(el).text().trim().replace(/\s+/g, ' ')}`);
    }
  });

  console.log('\nRelevant Links found:');
  for (const l of [...links].slice(0, 15)) {
    console.log(' ', l);
  }

  // Check script tags for category/series ID
  $('script').each((i, el) => {
    const content = $(el).html() || '';
    if (content.includes('categoryId') || content.includes('seriesId') || content.includes('seriesContentId') || content.includes('category')) {
      const matches = content.match(/.*(category|series|vod).*[:=].*/gi);
      if (matches) {
        console.log(`\nScript ${i} matches:`, matches.slice(0, 5));
      }
    }
  });

  // Check ERR API category getByUrl
  try {
    const apiRes = await fetch('https://services.err.ee/api/v2/category/getByUrl?url=' + encodeURIComponent(url));
    if (apiRes.ok) {
      const apiJson = await apiRes.json();
      console.log('\nERR API category/getByUrl:', JSON.stringify(apiJson, null, 2));
    }
  } catch (e) {
    console.log('API error:', e.message);
  }
}

inspectSoovideAeg().catch(console.error);
