import * as cheerio from 'cheerio';

async function checkSoovideAeg() {
  const url = 'https://vikerraadio.err.ee/arhiiv/soovide_aeg';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);

  console.log('Title:', $('title').text());
  console.log('Heading:', $('h1, h2').map((_, el) => $(el).text().trim()).get());

  // Search for any series IDs or numbers in the HTML
  console.log('\n--- Script contents ---');
  $('script').each((i, el) => {
    const text = $(el).html() || '';
    if (text.includes('broadcast') || text.includes('seriesContentId') || text.includes('radiomanUrl') || text.includes('category') || text.includes('soovide')) {
      console.log(`[Script ${i}]:`);
      console.log(text.slice(0, 500));
    }
  });

  // Check all links
  console.log('\n--- Links ---');
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (href.startsWith('/') || href.includes('vikerraadio')) {
      console.log(`${href} => ${text}`);
    }
  });
}

checkSoovideAeg().catch(console.error);
