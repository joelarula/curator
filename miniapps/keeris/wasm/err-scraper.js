/**
 * wasm/err-scraper.js
 * Browser-native ERR Radio scraper for the WASM Web Worker.
 * Uses fetch + cheerio (DOMParser is not available in Web Worker global scope).
 * Mirrors src/err-client.js + src/episode-parser.js + src/scrape.js logic.
 */

import * as cheerio from 'cheerio';

const ERR_BASE = 'https://vikerraadio.err.ee';
const ARCHIVE_API = 'https://vikerraadio.err.ee/api/broadcast/broadcasts';
const REQUEST_DELAY_MS = 400;

let lastRequestAt = 0;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function errFetch(url, type = 'json') {
  const wait = REQUEST_DELAY_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  const res = await fetch(url, {
    headers: {
      'Accept': type === 'json' ? 'application/json' : 'text/html,application/xhtml+xml,*/*;q=0.9',
      'Accept-Language': 'et-EE,et;q=0.9,en;q=0.7',
    },
  });
  lastRequestAt = Date.now();
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return type === 'json' ? res.json() : res.text();
}

async function fetchArchivePage(params) {
  const query = new URLSearchParams({
    seriesContentId: String(params.seriesContentId),
    radiomanUrl: '',
    limit: String(params.limit ?? 50),
    ...(params.unixTime ? { unixTime: String(params.unixTime), previousBlock: 'true' } : {}),
  });
  return errFetch(`${ARCHIVE_API}?${query}`, 'json');
}

/** Extract the broadcast/publish date from an ERR episode HTML page (JSON-LD, meta tags, or <time>). */
function parseEpisodeDateFromHtml(html) {
  const $ = cheerio.load(html);

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
    } catch (_) {}
  });
  if (jsonLdDate) return new Date(jsonLdDate).toISOString();

  const metaDate =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[itemprop="datePublished"]').attr('content') ||
    $('meta[name="date"]').attr('content');
  if (metaDate) return new Date(metaDate).toISOString();

  const timeEl = $('time[datetime]').first().attr('datetime');
  if (timeEl) return new Date(timeEl).toISOString();

  return null;
}

async function discoverAllEpisodes(seriesContentId, { shouldStop, onPage } = {}) {
  const episodes = new Map();
  const isUrl = String(seriesContentId).startsWith('http://') || String(seriesContentId).startsWith('https://');

  // Some manifest entries have no numeric series id, only a single episode page
  // to crawl via its "carouselJsonStruct" related-episodes JSON-LD block.
  if (isUrl) {
    const visitedUrls = new Set();
    const queue = [String(seriesContentId)];
    let page = 0;
    while (queue.length > 0) {
      const url = queue.shift();
      if (visitedUrls.has(url)) continue;
      visitedUrls.add(url);
      page++;
      onPage?.(page);

      const matches = [...url.matchAll(/\/(\d+)/g)];
      const id = matches.length > 0 ? Number(matches[matches.length - 1][1]) : Date.now();

      try {
        const html = await errFetch(url, 'text');
        const isoDate = parseEpisodeDateFromHtml(html);
        const scheduleStart = isoDate ? Math.floor(new Date(isoDate).getTime() / 1000) : null;
        const epObj = { id, url, scheduleStart };
        episodes.set(id, epObj);

        if (shouldStop?.([epObj])) break;

        const jsonMatch = html.match(/<script id="carouselJsonStruct" type="application\/ld\+json">(.*?)<\/script>/s);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[1]);
          const items = data.itemListElement || [];
          for (const item of items) {
            if (item.url && !visitedUrls.has(item.url)) queue.push(item.url);
          }
        }
      } catch (_) {
        episodes.set(id, { id, url, scheduleStart: null });
      }
    }
    return [...episodes.values()];
  }

  const cursors = new Set();
  let params = { seriesContentId, limit: 50 };
  let page = 0;
  while (true) {
    page++;
    const response = await fetchArchivePage(params);
    onPage?.(page, response);
    const items = response?.data ?? [];
    for (const episode of items) episodes.set(episode.id, episode);

    if (shouldStop?.(items)) break;

    const cursor = response?.previous;
    if (!cursor || cursors.has(cursor)) break;
    cursors.add(cursor);
    params = { seriesContentId, unixTime: cursor, limit: 50 };
  }
  return [...episodes.values()];
}

function parseMusicListFromHtml(html) {
  const $ = cheerio.load(html);
  const tracks = [];
  function clean(text) { return (text ?? '').replace(/\s+/g, ' ').trim(); }
  const isNav = (t) =>
    /saated a-\u00fc|ettey?tlus|po-russki|vaegkuuljatele|otse|ajakava|saatekava|e-post|kontakt|toimetaja:|saatejuht:|autor:|helioperaator:|foto:|pildi autor/i.test(t);

  // 1. Try structured .music-list-item
  $('.music-list-item').each((index, el) => {
    const row = $(el);
    const artist = clean(row.find('.music-artist').first().text());
    const title = clean(row.find('.music-title').first().text());
    const rawText = clean(row.text());
    if (artist || title || rawText) tracks.push({ position: index + 1, artist: artist || null, title: title || null, rawText });
  });
  if (tracks.length > 0) return tracks;

  // 2. Fallback: numbered or hyphenated track lines in article paragraphs/list items
  let position = 1;
  $('.radio-article-body p, .radio-article p, article p, section p, .body-text p, .content p, .article-body p, li, p').each((_, el) => {
    const lines = $(el).text().split('\n').map(clean).filter(Boolean);
    for (const text of lines) {
      if (isNav(text)) continue;
      const match = text.match(/^(?:\d+[.)]\s*)?([^\u2013\u2014-]+)\s*[\u2013\u2014-]\s*(.+)$/);
      if (match) {
        const artist = clean(match[1].replace(/^\d+[.)]\s*/, ''));
        const title = clean(match[2]);
        if (artist && title && artist.length > 1 && artist.length < 100 && title.length > 1 && title.length < 150 && !isNav(artist) && !isNav(title)) {
          tracks.push({ position: position++, artist, title, rawText: text });
        }
      }
    }
  });
  if (tracks.length > 0) return tracks;

  // 3. Fallback: song titles after a colon in the lead/description text
  const textSources = [
    clean($('.lead, .summary, meta[name="description"]').first().attr('content') ?? $('.lead, .summary').first().text()),
    ...$('.radio-article-body p, .radio-article p, article p, section p, .body-text p, .content p').map((_, el) => clean($(el).text())).get(),
  ].filter(Boolean);

  for (const text of textSources) {
    const colonIndex = text.indexOf(':');
    if (colonIndex > 0 && colonIndex < 100) {
      const potentialArtist = clean(text.slice(0, colonIndex).replace(/.*[./|]\s*/, '').replace(/\d+\s*(eri|saade)?/i, '').trim());
      const listText = text.slice(colonIndex + 1);
      const parts = listText.split(/[,;\n]+/).map(clean).filter((p) => p.length > 2 && p.length < 120 && !p.toLowerCase().startsWith('stuudios'));
      if (parts.length >= 2) {
        let colonPosition = 1;
        for (const title of parts) {
          tracks.push({
            position: colonPosition++,
            artist: potentialArtist || null,
            title,
            rawText: potentialArtist ? `${potentialArtist} - ${title}` : title,
          });
        }
        break;
      }
    }
  }
  return tracks;
}

function parseEpisodeMetadata(html) {
  const $ = cheerio.load(html);
  function clean(text) { return (text ?? '').replace(/\s+/g, ' ').trim(); }
  const description = clean($('.lead, .summary, meta[name="description"]').first().attr('content') ?? $('.lead, .summary').first().text());
  const paragraphs = [];
  $('.radio-article-body p, .radio-article p, article p, section p, .body-text p, .content p').each((_, el) => {
    const text = clean($(el).text());
    if (text && text.length > 5) paragraphs.push(text);
  });
  const fullText = clean(paragraphs.join('\n\n') || $('article, section, .radio-article-body').first().text());
  return {
    description: description || null,
    fullText: fullText || null,
    summary: description ? description.slice(0, 500) : (fullText ? fullText.slice(0, 500) : null),
    keywords: null,
  };
}

function episodeDate(item) {
  const raw = item.scheduledAt ?? item.publicStart ?? item.broadcastedOn ?? null;
  if (!raw) return null;
  if (typeof raw === 'number') return new Date(raw * 1000).toISOString();
  return new Date(raw).toISOString();
}

function makeFingerprint(artist, title, rawText) {
  const normArtist = (artist ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const normTitle = (title ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (normArtist || normTitle) return `${normArtist}___${normTitle}`;
  const raw = (rawText ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return raw || null;
}

export async function scrapeProgram(db, { seriesContentId, programTitle, refresh = false, onProgress } = {}) {
  function queryOne(sql, params = []) {
    const rows = [];
    db.exec({ sql, bind: params, rowMode: 'object', resultRows: rows });
    return rows[0] ?? null;
  }
  function executeSql(sql, params = []) {
    db.exec({ sql, bind: params });
  }

  onProgress?.('log', `[Scraper] Starting scrape for "${programTitle}" (seriesId: ${seriesContentId})`);

  const now = new Date().toISOString();
  executeSql(`
    INSERT INTO programs (series_id, title, slug, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(series_id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at
  `, [String(seriesContentId), programTitle, programTitle.toLowerCase().replace(/[^a-z0-9]/g, '-'), now, now]);

  const program = queryOne('SELECT id FROM programs WHERE series_id = ?', [String(seriesContentId)]);
  const programId = program?.id;

  onProgress?.('log', `[Scraper] Discovering episodes from ERR archive API...`);

  const shouldStop = refresh
    ? undefined
    : (items) => items.some((item) => {
        const row = queryOne('SELECT parse_status FROM episodes WHERE id = ?', [item.id]);
        return row && ['parsed', 'no_tracks'].includes(row.parse_status);
      });

  let discovered;
  try {
    discovered = await discoverAllEpisodes(seriesContentId, {
      shouldStop,
      onPage: (page) => onProgress?.('log', `[Scraper] Archive page ${page}...`),
    });
  } catch (err) {
    onProgress?.('error', `[Scraper] Discovery failed: ${err.message}`);
    throw err;
  }

  const toProcess = refresh
    ? discovered
    : discovered.filter((item) => {
        const row = queryOne('SELECT parse_status FROM episodes WHERE id = ?', [item.id]);
        return !row || !['parsed', 'no_tracks'].includes(row.parse_status);
      });

  onProgress?.('stats', { discovered: discovered.length, toProcess: toProcess.length });
  onProgress?.('log', `[Scraper] Found ${discovered.length} episodes total, ${toProcess.length} new to process`);

  let parsed = 0, tracksSaved = 0, failures = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i];
    const scheduledAt = episodeDate(item);
    const episodeUrl = item.url ?? `${ERR_BASE}/${item.id}`;
    const episodeTitle = item.heading ?? item.title ?? item.name ?? String(item.id);

    try {
      executeSql('BEGIN');
      executeSql(`
        INSERT INTO episodes (id, program_id, url, title, scheduled_at, fetched_at, parse_status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
        ON CONFLICT(id) DO UPDATE SET
          program_id = COALESCE(excluded.program_id, episodes.program_id),
          url = excluded.url,
          title = excluded.title,
          scheduled_at = excluded.scheduled_at,
          fetched_at = excluded.fetched_at,
          parse_status = 'pending'
      `, [item.id, programId ?? null, episodeUrl, episodeTitle, scheduledAt ?? null, now]);
      executeSql('COMMIT');

      const html = await errFetch(episodeUrl, 'text');
      const tracks = parseMusicListFromHtml(html);
      const metadata = parseEpisodeMetadata(html);
      const status = (tracks.length || metadata.fullText) ? 'parsed' : 'no_tracks';

      // Batch this episode's track/metadata/status writes into one transaction
      // instead of ~30 auto-committing statements (each syncs to the OPFS file).
      executeSql('BEGIN');
      if (tracks.length > 0) {
        executeSql('DELETE FROM tracks WHERE episode_id = ?', [item.id]);
        for (const track of tracks) {
          const fp = makeFingerprint(track.artist, track.title, track.rawText);
          let utId = null;
          if (fp) {
            const existing = queryOne('SELECT id FROM unique_tracks WHERE fingerprint = ?', [fp]);
            if (existing) {
              utId = existing.id;
              executeSql(
                'UPDATE unique_tracks SET play_count = play_count + 1, last_played_at = COALESCE(?, last_played_at), updated_at = ? WHERE id = ?',
                [scheduledAt, now, utId]
              );
            } else {
              executeSql(
                'INSERT INTO unique_tracks (fingerprint, artist, title, play_count, first_played_at, last_played_at, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)',
                [fp, track.artist ?? null, track.title ?? null, scheduledAt, scheduledAt, now, now]
              );
              const newUt = queryOne('SELECT id FROM unique_tracks WHERE fingerprint = ?', [fp]);
              utId = newUt?.id ?? null;
            }
          }
          executeSql(
            'INSERT OR IGNORE INTO tracks (episode_id, unique_track_id, position, artist, title, raw_text) VALUES (?, ?, ?, ?, ?, ?)',
            [item.id, utId, track.position, track.artist ?? null, track.title ?? null, track.rawText]
          );
          tracksSaved++;
        }
      }

      if (metadata.description || metadata.fullText || metadata.summary) {
        executeSql(`
          INSERT INTO episode_metadata (episode_id, description, full_text, summary, keywords)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(episode_id) DO UPDATE SET
            description = excluded.description, full_text = excluded.full_text,
            summary = excluded.summary, keywords = excluded.keywords
        `, [item.id, metadata.description ?? null, metadata.fullText ?? null, metadata.summary ?? null, null]);
      }

      executeSql("UPDATE episodes SET parse_status = ?, fetched_at = ? WHERE id = ?", [status, now, item.id]);
      executeSql('COMMIT');
      parsed++;

      onProgress?.('episode', {
        index: i + 1,
        total: toProcess.length,
        episodeId: item.id,
        episodeTitle,
        scheduledAt,
        tracksCount: tracks.length,
        status,
      });
    } catch (err) {
      try { executeSql('ROLLBACK'); } catch (_) {}
      failures++;
      executeSql("UPDATE episodes SET parse_status = 'failed', parse_error = ? WHERE id = ?", [String(err), item.id]);
      onProgress?.('log', `[Scraper] Failed ${episodeUrl}: ${err.message}`);
    }
  }

  const result = { seriesContentId, programTitle, discovered: discovered.length, processed: toProcess.length, parsed, tracksSaved, failures };
  onProgress?.('done', result);
  onProgress?.('log', `[Scraper] Done! Parsed ${parsed} episodes, saved ${tracksSaved} tracks, ${failures} failures.`);
  return result;
}
