import * as cheerio from 'cheerio';

export interface ParsedTrack {
  position: number;
  artist: string | null;
  title: string | null;
  rawText: string;
}

export interface ParsedEpisodeText {
  description: string | null;
  fullText: string | null;
  summary: string | null;
  keywords: string | null;
}

function clean(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function parseMusicList(html: string): ParsedTrack[] {
  const $ = cheerio.load(html);
  const tracks: ParsedTrack[] = [];

  // 1. Primary: Structured .music-list-item (modern ERR format across Vikerraadio & Klassikaraadio)
  $('.music-list-item').each((index, element) => {
    const row = $(element);
    const artist = clean(row.find('.music-artist').first().text());
    const title = clean(row.find('.music-title').first().text());
    const rawText = clean(row.text());
    if (artist || title || rawText) {
      tracks.push({
        position: index + 1,
        artist: artist || null,
        title: title || null,
        rawText: rawText || (artist && title ? `${artist} - ${title}` : (artist || title || ''))
      });
    }
  });

  if (tracks.length > 0) {
    return tracks;
  }

  // 2. Fallback: Parse paragraphs strictly from the article body container (never whole page / footer)
  const isNavOrProse = (t: string) => {
    return /saated a-ü|etteütlus|по-русски|vaegkuuljatele|otse|ajakava|saatekava|e-post|e-viktoriin|kontakt|toimetaja:|saatejuht:|autor:|helioperaator:|foto:|pildi autor|stuudios on|tutvu siin|toimub|tähistatakse|käsitlemisel|alates \d|unustasid salasõna|järgmisena mängib/i.test(t)
      || /\b(kell\s+\d{1,2}[\.:]\d{2}|\d{1,2}[\.:]\d{2}\s*[-–—]\s*\d{1,2}[\.:]\d{2})\b/i.test(t)
      || /^(esmaspäev|teisipäev|kolmapäev|neljapäev|reede|laupäev|pühapäev)\b/i.test(t);
  };

  const bodyContainers = $('.radio-article-body, .article-body, .main-content .body, .content-body, .lead-body, article .body, .radio-article');
  
  let position = 1;
  bodyContainers.find('p, li, div.track-row, div.playlist-row').each((_, el) => {
    const rawBlock = $(el).text();
    const lines = rawBlock.split('\n').map(clean).filter(Boolean);
    for (const text of lines) {
      if (text.length > 150 || text.length < 5 || isNavOrProse(text)) continue;
      
      // Match lines like "Artist - Title" or "1. Artist - Title" or "Artist – Title"
      const match = text.match(/^(?:\d+[\.\)]\s*)?([^-–—]+?)\s*[-–—]\s*(.+)$/);
      if (match) {
        const artist = clean(match[1].replace(/^\d+[\.\)]\s*/, ''));
        const title = clean(match[2]);
        
        // Ensure artist and title look like names/titles, not sentences or times
        if (
          artist && title &&
          artist.length >= 2 && artist.length < 80 &&
          title.length >= 2 && title.length < 100 &&
          !isNavOrProse(artist) && !isNavOrProse(title) &&
          !/\.\s+[A-ZÕÄÖÜ]/.test(title) &&
          !/^\w\b/.test(title)
        ) {
          tracks.push({ position: position++, artist, title, rawText: text });
        }
      }
    }
  });

  return tracks;
}

export function parseEpisodeText(html: string): ParsedEpisodeText {
  const $ = cheerio.load(html);
  const description = clean($('.lead, .summary, meta[name="description"]').first().attr('content') ?? $('.lead, .summary').first().text());
  const paragraphs: string[] = [];
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
export function parseEpisodeDate(html: string): string | null {
  const $ = cheerio.load(html);

  // 1. JSON-LD structured data (most reliable)
  let jsonLdDate: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLdDate) return;
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const d = item.datePublished || item.startDate || item.dateCreated;
        if (d) { jsonLdDate = d; return; }
      }
    } catch (_e) {}
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
