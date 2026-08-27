import { createHash } from 'node:crypto';
import { discoverEpisodes, episodeDate } from './archive.js';
import { parseMusicList } from './episode-parser.js';
import { saveEpisode } from './db.js';

function dateOnly(value) { return value?.slice(0, 10) ?? null; }

export async function scrape({ client, db, from, to, refresh = false, onEpisode, logger = console } = {}) {
  const discovered = await discoverEpisodes(client, { onPage: (page) => logger.log(`Archive page ${page}`) });
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
      saveEpisode(db, episode, tracks, { rawHash, status: tracks.length ? 'parsed' : 'no_tracks' });
      await onEpisode?.(episode, tracks);
      parsed += 1; tracksSaved += tracks.length;
      logger.log(`${episode.scheduledAt?.slice(0, 10) ?? 'unknown'} ${item.url}: ${tracks.length} tracks`);
    } catch (error) {
      failures += 1;
      saveEpisode(db, episode, [], { status: 'failed', error: String(error) });
      logger.error(`Failed ${item.url}: ${error.message}`);
    }
  }
  return { pages: discovered.pages, episodesSeen: selected.length, episodesParsed: parsed, tracksSaved, failures, refresh };
}