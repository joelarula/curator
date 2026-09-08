import * as cheerio from 'cheerio';

function clean(value) { return (value ?? '').replace(/\s+/g, ' ').trim(); }

function parseMusicList(html) {
  const $ = cheerio.load(html);
  const tracks = [];

  // 1. Try structured .music-list-item
  $('.music-list-item').each((index, element) => {
    const row = $(element);
    const artist = clean(row.find('.music-artist').first().text());
    const title = clean(row.find('.music-title').first().text());
    const rawText = clean(row.text());
    if (artist || title || rawText) tracks.push({ position: index + 1, artist: artist || null, title: title || null, rawText });
  });

  // 2. Fallback: Parse paragraphs/list-items containing numbered or hyphenated track lines
  if (tracks.length === 0) {
    let position = 1;
    const isNav = (t) => /saated a-ü|etteütlus|по-русски|vaegkuuljatele|otse|ajakava|saatekava/i.test(t);
    $('.radio-article-body p, .radio-article p, article p, section p, .body-text p, .content p, .article-body p, li, p').each((_, el) => {
      const text = clean($(el).text());
      if (isNav(text)) return;
      const match = text.match(/^(?:\d+[\.\)]\s*)?([^-–—]+)\s*[-–—]\s*(.+)$/);
      if (match) {
        const artist = clean(match[1].replace(/^\d+[\.\)]\s*/, ''));
        const title = clean(match[2]);
        if (artist && title && artist.length < 100 && title.length < 150 && !isNav(artist) && !isNav(title) && !/^(saade|esmaspäev|teisipäev|kolmapäev|neljapäev|reede|laupäev|pühapäev)\b/i.test(artist)) {
          tracks.push({ position: position++, artist, title, rawText: text });
        }
      }
    });
  }

  return tracks;
}

async function run() {
  const url = 'https://vikerraadio.err.ee/1230097/kantri-alati-jaab-dolly-parton-75';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const tracks = parseMusicList(html);
  console.log(`Parsed ${tracks.length} tracks:`);
  console.log(JSON.stringify(tracks, null, 2));
}

run().catch(console.error);
