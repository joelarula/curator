import * as cheerio from 'cheerio';
import { ErrClient } from '../src/err-client.js';
import { discoverEpisodes } from '../src/archive.js';

async function testDiscovery() {
  const client = new ErrClient();
  const url = 'https://vikerraadio.err.ee/817942/stuudios-on-jaan-elgula-2-tund/818433';
  
  console.log('Testing discoverEpisodes for URL:', url);
  const res = await discoverEpisodes(client, { seriesContentId: url });
  console.log(`Discovered ${res.episodes.length} episodes via URL discovery!`);
  console.log('Discovered sample:', res.episodes.slice(0, 10));

  // Let's also check if there are other episodes on the page (e.g. "Kuula eelmisi saateid", "saated", carousel, etc.)
  const html = await client.episode(url);
  const $ = cheerio.load(html);
  console.log('\n--- All href links containing numbers or /stuudios ---');
  const foundUrls = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && (href.includes('817') || href.includes('818') || href.includes('stuudios') || href.includes('elgula'))) {
      const fullUrl = href.startsWith('http') ? href : `https://vikerraadio.err.ee${href.startsWith('/') ? '' : '/'}${href}`;
      if (!foundUrls.has(fullUrl)) {
        foundUrls.add(fullUrl);
        console.log('Found link:', fullUrl, '| Text:', $(el).text().trim().replace(/\s+/g, ' '));
      }
    }
  });

  console.log(`Total found relevant URLs on page: ${foundUrls.size}`);
}

testDiscovery().catch(console.error);
