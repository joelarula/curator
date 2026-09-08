import * as cheerio from 'cheerio';

async function checkParents() {
  const url = 'https://vikerraadio.err.ee/1230097/kantri-alati-jaab-dolly-parton-75';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);

  $('p').each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes('Karavan')) {
      console.log('Parent chain for Karavan <p>:');
      let cur = $(el);
      while (cur && cur.length && cur[0].name !== 'html') {
        console.log(`  <${cur[0].name} class="${cur.attr('class') || ''}" id="${cur.attr('id') || ''}">`);
        cur = cur.parent();
      }
    }
  });
}

checkParents().catch(console.error);
