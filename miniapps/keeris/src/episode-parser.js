import * as cheerio from 'cheerio';

function clean(value) { return (value ?? '').replace(/\s+/g, ' ').trim(); }

export function parseMusicList(html) {
  const $ = cheerio.load(html);
  const tracks = [];
  $('.music-list-item').each((index, element) => {
    const row = $(element);
    const artist = clean(row.find('.music-artist').first().text());
    const title = clean(row.find('.music-title').first().text());
    const rawText = clean(row.text());
    if (artist || title || rawText) tracks.push({ position: index + 1, artist: artist || null, title: title || null, rawText });
  });
  return tracks;
}