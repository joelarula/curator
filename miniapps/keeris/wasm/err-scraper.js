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

let _activePauseChecker = null;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function errFetch(url, type = 'json') {
  if (typeof _activePauseChecker === 'function') {
    await _activePauseChecker();
  }
  const wait = REQUEST_DELAY_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  if (typeof _activePauseChecker === 'function') {
    await _activePauseChecker();
  }
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

async function discoverAllEpisodes(seriesContentId, { shouldStop, onPage, isPaused, onProgress } = {}) {
  const episodes = new Map();
  const isUrl = String(seriesContentId).startsWith('http://') || String(seriesContentId).startsWith('https://');

  // Some manifest entries have no numeric series id, only a single episode page
  // to crawl via its "carouselJsonStruct" related-episodes JSON-LD block.
  if (isUrl) {
    const visitedUrls = new Set();
    const queue = [String(seriesContentId)];
    let page = 0;
    while (queue.length > 0) {
      if (typeof isPaused === 'function' && isPaused()) {
        onProgress?.('log', `[Scraper] ⏸ Scraper paused during discovery. Waiting to resume...`);
        while (typeof isPaused === 'function' && isPaused()) {
          await sleep(500);
        }
        onProgress?.('log', `[Scraper] ▶ Scraper resumed discovery`);
      }
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
    if (typeof isPaused === 'function' && isPaused()) {
      onProgress?.('log', `[Scraper] ⏸ Scraper paused at archive page ${page + 1}. Waiting to resume...`);
      while (typeof isPaused === 'function' && isPaused()) {
        await sleep(500);
      }
      onProgress?.('log', `[Scraper] ▶ Scraper resumed at archive page ${page + 1}`);
    }
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

export async function scrapeProgram(db, { seriesContentId, programTitle, refresh = false, onProgress, isPaused, checkPause } = {}) {
  const effectiveCheckPause = checkPause || (async () => {
    if (typeof isPaused === 'function' && isPaused()) {
      onProgress?.('log', `[Scraper] ⏸ Scraper paused. Waiting to resume...`);
      while (typeof isPaused === 'function' && isPaused()) {
        await sleep(400);
      }
      onProgress?.('log', `[Scraper] ▶ Scraper resumed.`);
    }
  });

  _activePauseChecker = effectiveCheckPause;
  try {
    return await _runScrapeProgram(db, { seriesContentId, programTitle, refresh, onProgress, isPaused, checkPause: effectiveCheckPause });
  } finally {
    _activePauseChecker = null;
  }
}

/**
 * Run a bounded concurrency pool over an async-iterable source of work items.
 * Up to `concurrency` items are processed in parallel at any moment.
 * @param {AsyncIterable<T>} source - yields items as they are discovered
 * @param {number} concurrency - max parallel workers
 * @param {(item: T) => Promise<void>} worker - async function to process one item
 */
async function pipelinePool(source, concurrency, worker) {
  const active = new Set();
  for await (const item of source) {
    if (active.size >= concurrency) {
      // Wait for the first settled slot to free up
      await Promise.race(active);
    }
    const task = worker(item).finally(() => active.delete(task));
    active.add(task);
  }
  // Drain remaining active tasks
  await Promise.all(active);
}

/**
 * Async generator that yields episode objects one archive API page at a time,
 * emitting each item as soon as its page lands — no blocking "collect all" phase.
 * For URL-based (non-series-id) programs it falls back to sequential page crawling.
 */
async function* streamEpisodes(seriesContentId, { shouldStop, onPage, isPaused, onProgress } = {}) {
  const isUrl = String(seriesContentId).startsWith('http://') || String(seriesContentId).startsWith('https://');

  if (isUrl) {
    // URL-based crawl: pages are HTML episodes linked via carouselJsonStruct
    const visitedUrls = new Set();
    const queue = [String(seriesContentId)];
    let page = 0;
    while (queue.length > 0) {
      if (typeof isPaused === 'function' && isPaused()) {
        onProgress?.('log', `[Scraper] ⏸ Paused during discovery. Waiting...`);
        while (typeof isPaused === 'function' && isPaused()) await sleep(500);
        onProgress?.('log', `[Scraper] ▶ Resumed discovery`);
      }
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
        const epObj = { id, url, scheduleStart, _prefetchedHtml: html };
        if (shouldStop?.([epObj])) return;
        yield epObj;
        const jsonMatch = html.match(/<script id="carouselJsonStruct" type="application\/ld\+json">(.*?)<\/script>/s);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[1]);
          for (const item of (data.itemListElement || [])) {
            if (item.url && !visitedUrls.has(item.url)) queue.push(item.url);
          }
        }
      } catch (_) {
        yield { id, url, scheduleStart: null };
      }
    }
    return;
  }

  // Series-id archive API: paginate and yield each episode as its page lands
  const cursors = new Set();
  let params = { seriesContentId, limit: 50 };
  let page = 0;
  const seenIds = new Set();
  while (true) {
    if (typeof isPaused === 'function' && isPaused()) {
      onProgress?.('log', `[Scraper] ⏸ Paused at archive page ${page + 1}. Waiting...`);
      while (typeof isPaused === 'function' && isPaused()) await sleep(500);
      onProgress?.('log', `[Scraper] ▶ Resumed at archive page ${page + 1}`);
    }
    page++;
    const response = await fetchArchivePage(params);
    const items = response?.data ?? [];
    onPage?.(page, items.length);

    // Yield each new episode on this page immediately
    let stopEarly = false;
    for (const episode of items) {
      if (seenIds.has(episode.id)) continue;
      seenIds.add(episode.id);
      if (shouldStop?.([episode])) { stopEarly = true; break; }
      yield episode;
    }
    if (stopEarly) break;

    const cursor = response?.previous;
    if (!cursor || cursors.has(cursor)) break;
    cursors.add(cursor);
    params = { seriesContentId, unixTime: cursor, limit: 50 };
  }
}

async function _runScrapeProgram(db, { seriesContentId, programTitle, refresh = false, onProgress, isPaused, checkPause } = {}) {
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

  onProgress?.('log', `[Scraper] Streaming episodes from ERR archive API with parallel processing...`);

  // For incremental (non-refresh) runs: stop discovery once we hit an already-parsed page
  const shouldStop = refresh
    ? undefined
    : (items) => items.some((item) => {
        const row = queryOne('SELECT parse_status FROM episodes WHERE id = ?', [item.id]);
        return row && ['parsed', 'no_tracks'].includes(row.parse_status);
      });

  let discovered = 0, parsed = 0, tracksSaved = 0, failures = 0;
  let pageCount = 0;

  // processSingleEpisode: fetch + parse + write one episode to SQLite
  async function processSingleEpisode(item) {
    if (typeof isPaused === 'function' && isPaused()) {
      while (typeof isPaused === 'function' && isPaused()) await sleep(600);
    }

    // Skip already-done episodes on incremental runs
    if (!refresh) {
      const row = queryOne('SELECT parse_status FROM episodes WHERE id = ?', [item.id]);
      if (row && ['parsed', 'no_tracks'].includes(row.parse_status)) return;
    }

    const scheduledAt = episodeDate(item);
    const episodeUrl = item.url ?? `${ERR_BASE}/${item.id}`;
    const episodeTitle = item.heading ?? item.title ?? item.name ?? String(item.id);
    const episodeIdx = ++parsed; // approximate (discovery still in flight)

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

      // Reuse prefetched HTML if the generator already fetched it (URL-mode)
      const html = item._prefetchedHtml ?? await errFetch(episodeUrl, 'text');
      const tracks = parseMusicListFromHtml(html);
      const metadata = parseEpisodeMetadata(html);
      const status = (tracks.length || metadata.fullText) ? 'parsed' : 'no_tracks';

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

      executeSql('UPDATE episodes SET parse_status = ?, fetched_at = ? WHERE id = ?', [status, now, item.id]);
      executeSql('COMMIT');

      onProgress?.('episode', {
        index: episodeIdx,
        total: discovered, // live total grows as discovery proceeds
        episodeId: item.id,
        episodeTitle,
        scheduledAt,
        tracksCount: tracks.length,
        status,
      });
    } catch (err) {
      try { executeSql('ROLLBACK'); } catch (_) {}
      failures++;
      try { executeSql("UPDATE episodes SET parse_status = 'failed', parse_error = ? WHERE id = ?", [String(err), item.id]); } catch (_) {}
      onProgress?.('log', `[Scraper] Failed ${episodeUrl}: ${err.message}`);
    }
  }

  // Stream discovery and processing in parallel with a pool of 3 concurrent workers
  const episodeStream = streamEpisodes(seriesContentId, {
    shouldStop,
    onPage: (page, count) => {
      pageCount = page;
      onProgress?.('log', `[Scraper] Archive page ${page}${count !== undefined ? ` (${count} episodes)` : ''}...`);
    },
    isPaused,
    onProgress,
  });

  // Wrap the stream to count discovered items as they arrive
  async function* countingStream() {
    for await (const item of episodeStream) {
      discovered++;
      onProgress?.('stats', { discovered, toProcess: discovered });
      yield item;
    }
  }

  // CONCURRENCY = 3: discovery of archive pages + up to 3 episode HTML fetches run simultaneously
  await pipelinePool(countingStream(), 3, processSingleEpisode);

  const result = { seriesContentId, programTitle, discovered, processed: discovered, parsed, tracksSaved, failures };
  onProgress?.('done', result);
  onProgress?.('log', `[Scraper] Done! Parsed ${parsed} episodes (${pageCount} archive pages), saved ${tracksSaved} tracks, ${failures} failures.`);
  return result;
}

