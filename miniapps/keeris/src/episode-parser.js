import * as cheerio from 'cheerio';

function clean(value) { return (value ?? '').replace(/\s+/g, ' ').trim(); }

export function parseMusicList(html) {
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
    const isNav = (t) => /saated a-ü|etteütlus|по-русски|vaegkuuljatele|otse|ajakava|saatekava|e-post|kontakt|toimetaja:|saatejuht:|autor:|helioperaator:|foto:|pildi autor/i.test(t);
    $('.radio-article-body p, .radio-article p, article p, section p, .body-text p, .content p, .article-body p, li, p').each((_, el) => {
      const rawBlock = $(el).text();
      const lines = rawBlock.split('\n').map(clean).filter(Boolean);
      for (const text of lines) {
        if (isNav(text)) continue;
        const match = text.match(/^(?:\d+[\.\)]\s*)?([^-–—]+)\s*[-–—]\s*(.+)$/);
        if (match) {
          const artist = clean(match[1].replace(/^\d+[\.\)]\s*/, ''));
          const title = clean(match[2]);
          if (
            artist && title &&
            artist.length > 1 && artist.length < 100 &&
            title.length > 1 && title.length < 150 &&
            !isNav(artist) && !isNav(title) &&
            !/^(saade|esmaspäev|teisipäev|kolmapäev|neljapäev|reede|laupäev|pühapäev)\b/i.test(artist)
          ) {
            tracks.push({ position: position++, artist, title, rawText: text });
          }
        }
      }
    });
  }

  // 3. Fallback: Extract song titles after colon from lead/description text if colon & commas are present
  if (tracks.length === 0) {
    const textSources = [
      clean($('.lead, .summary, meta[name="description"]').first().attr('content') ?? $('.lead, .summary').first().text()),
      ...$('.radio-article-body p, .radio-article p, article p, section p, .body-text p, .content p').map((_, el) => clean($(el).text())).get()
    ].filter(Boolean);

    for (const text of textSources) {
      const colonIndex = text.indexOf(':');
      if (colonIndex > 0 && colonIndex < 100) {
        const potentialArtist = clean(text.slice(0, colonIndex).replace(/.*[.\/|]\s*/, '').replace(/\d+\s*(eri|saade)?/i, '').trim());
        const listText = text.slice(colonIndex + 1);
        const parts = listText.split(/[,;\n]+/).map(clean).filter((p) => p.length > 2 && p.length < 120 && !p.toLowerCase().startsWith('stuudios'));
        if (parts.length >= 2) {
          let position = 1;
          for (const title of parts) {
            tracks.push({
              position: position++,
              artist: potentialArtist || null,
              title,
              rawText: potentialArtist ? `${potentialArtist} - ${title}` : title,
            });
          }
          break;
        }
      }
    }
  }

  return tracks;
}

export function parseEpisodeText(html) {
  const $ = cheerio.load(html);
  const description = clean($('.lead, .summary, meta[name="description"]').first().attr('content') ?? $('.lead, .summary').first().text());
  const paragraphs = [];
  $('.radio-article-body p, .radio-article p, article p, section p, .body-text p, .content p').each((_, el) => {
    const text = clean($(el).text());
    if (text && text.length > 5) paragraphs.push(text);
  });
  const fullText = clean(paragraphs.join('\n\n') || $('article, section, .main-content, .radio-article-body').first().text());
  return {
    description: description || null,
    fullText: fullText || null,
    summary: description ? description.slice(0, 500) : (fullText ? fullText.slice(0, 500) : null),
    keywords: null,
  };
}

/**
 * Extract the broadcast/publish date from an ERR episode HTML page.
 * Tries JSON-LD structured data first, then meta tags, then visible time elements.
 * Returns an ISO 8601 string or null if not found.
 */
export function parseEpisodeDate(html) {
  const $ = cheerio.load(html);

  // 1. JSON-LD structured data (most reliable)
  let jsonLdDate = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLdDate) return;
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const d = item.datePublished || item.startDate || item.dateCreated;
        if (d) { jsonLdDate = d; return; }
      }
    } catch (e) {}
  });
  if (jsonLdDate) return new Date(jsonLdDate).toISOString();

  // 2. Meta tags
  const metaDate =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[itemprop="datePublished"]').attr('content') ||
    $('meta[name="date"]').attr('content');
  if (metaDate) return new Date(metaDate).toISOString();

  // 3. Visible <time> element with datetime attribute
  const timeEl = $('time[datetime]').first().attr('datetime');
  if (timeEl) return new Date(timeEl).toISOString();

  return null;
}