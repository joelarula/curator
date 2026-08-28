import { createHash } from 'node:crypto';
import { discoverEpisodes, episodeDate } from './archive.js';
import { parseMusicList, parseEpisodeText } from './episode-parser.js';
import { saveProgramData } from './db.js';

function dateOnly(value) { return value?.slice(0, 10) ?? null; }

export async function scrape({ client, db, seriesContentId = '1037846', programTitle = 'Kauamängiv', from, to, refresh = false, onEpisode, logger = console } = {}) {
  const isUrl = String(seriesContentId).startsWith('http://') || String(seriesContentId).startsWith('https://');

  if (isUrl) {
    const url = String(seriesContentId);
    const match = url.match(/\/(\d+)/);
    const id = match ? Number(match[1]) : Date.now();
    const item = { id, url, heading: programTitle, scheduleStart: Math.floor(Date.now() / 1000) };
    const selected = [item];
    let parsed = 0; let tracksSaved = 0; let failures = 0;

    const episode = { ...item, scheduledAt: episodeDate(item), publishedAt: new Date().toISOString() };
    try {
      const html = await client.episode(url);
      const rawHash = createHash('sha256').update(html).digest('hex');
      const tracks = parseMusicList(html);
      const metadata = parseEpisodeText(html);
      saveProgramData(db, {
        program: { seriesId: String(id), title: programTitle },
        episode,
        tracks,
        metadata,
        rawHash,
        status: (tracks.length || metadata.fullText) ? 'parsed' : 'no_tracks',
      });
      await onEpisode?.(episode, tracks, metadata);
      parsed += 1; tracksSaved += tracks.length;
      logger.log(`${episode.scheduledAt?.slice(0, 10) ?? 'unknown'} ${url}: ${tracks.length} tracks`);
    } catch (error) {
      failures += 1;
      logger.error(`Failed ${url}: ${error.message}`);
    }
    return { seriesContentId, programTitle, pages: 1, episodesSeen: 1, episodesParsed: parsed, tracksSaved, failures, refresh };
  }

  const discovered = await discoverEpisodes(client, { seriesContentId, onPage: (page) => logger.log(`Archive page ${page}`) });
  const selected = discovered.episodes.filter((episode) => {
    const date = dateOnly(episodeDate(episode));
    return (!from || date >= from) && (!to || date <= to);
  });
  let parsed = 0; let tracksSaved = 0; let failures = 0;
  for (const item of selected) {
    const episode = { ...item, scheduledAt: episodeDate(item), publishedAt: item.publicStart ? new Date(item.publicStart * 1000).toISOString() : null };
    const existing = db.prepare('SELECT parse_status FROM episodes WHERE id = ?').get(item.id);
    if (!refresh && existing && ['parsed', 'no_tracks'].includes(existing.parse_status)) continue;
    try {
      const html = await client.episode(item.url);
      const rawHash = createHash('sha256').update(html).digest('hex');
      const tracks = parseMusicList(html);
      const metadata = parseEpisodeText(html);
      saveProgramData(db, {
        program: { seriesId: seriesContentId, title: programTitle },
        episode,
        tracks,
        metadata,
        rawHash,
        status: (tracks.length || metadata.fullText) ? 'parsed' : 'no_tracks',
      });
      await onEpisode?.(episode, tracks, metadata);
      parsed += 1; tracksSaved += tracks.length;
      logger.log(`${episode.scheduledAt?.slice(0, 10) ?? 'unknown'} ${item.url}: ${tracks.length} tracks`);
    } catch (error) {
      failures += 1;
      saveProgramData(db, {
        program: { seriesId: seriesContentId, title: programTitle },
        episode,
        tracks: [],
        metadata: {},
        status: 'failed',
        error: String(error),
      });
      logger.error(`Failed ${item.url}: ${error.message}`);
    }
  }
  return { seriesContentId, programTitle, pages: discovered.pages, episodesSeen: selected.length, episodesParsed: parsed, tracksSaved, failures, refresh };
}