import { createHash } from 'node:crypto';
import { discoverEpisodes, episodeDate, type DiscoveredEpisode } from './archive.ts';
import { parseMusicList, parseEpisodeText, type ParsedTrack, type ParsedEpisodeText } from './episode-parser.ts';
import { saveProgramData } from './db.ts';
import { ErrClient } from './err-client.ts';

function dateOnly(value?: string | null): string | null {
  return value?.slice(0, 10) ?? null;
}

export interface ScrapeOptions {
  client: ErrClient;
  db: any;
  seriesContentId?: string;
  programTitle?: string;
  from?: string;
  to?: string;
  refresh?: boolean;
  onEpisode?: (episode: any, tracks: ParsedTrack[], metadata: ParsedEpisodeText) => Promise<void> | void;
  logger?: { log: (...args: any[]) => void; error: (...args: any[]) => void };
}

export interface ScrapeResult {
  seriesContentId: string;
  programTitle: string;
  pages: number;
  episodesSeen: number;
  episodesParsed: number;
  tracksSaved: number;
  failures: number;
  refresh: boolean;
}

export async function scrape({
  client,
  db,
  seriesContentId = '1037846',
  programTitle = 'Kauamängiv',
  from,
  to,
  refresh = false,
  onEpisode,
  logger = console,
}: ScrapeOptions): Promise<ScrapeResult> {
  const shouldStop = refresh
    ? undefined
    : (items: DiscoveredEpisode[]) => items.some((item) => {
        const row = db.prepare('SELECT parse_status FROM episodes WHERE id = ?').get(item.id);
        return row && ['parsed', 'no_tracks'].includes(row.parse_status);
      });

  const discovered = await discoverEpisodes(client, {
    seriesContentId,
    shouldStop,
    onPage: (page) => logger.log(`Archive page ${page}`),
  });

  const selected = discovered.episodes.filter((episode) => {
    const date = dateOnly(episodeDate(episode));
    return (!from || (date && date >= from)) && (!to || (date && date <= to));
  });

  let parsed = 0;
  let tracksSaved = 0;
  let failures = 0;

  for (const item of selected) {
    const episode = {
      ...item,
      scheduledAt: episodeDate(item),
      publishedAt: item.publicStart ? new Date(item.publicStart * 1000).toISOString() : null,
    };
    const existing = db.prepare('SELECT parse_status FROM episodes WHERE id = ?').get(item.id);
    if (!refresh && existing && ['parsed', 'no_tracks'].includes(existing.parse_status)) continue;

    try {
      const html = await client.episode(item.url);
      const rawHash = createHash('sha256').update(html).digest('hex');
      const tracks = parseMusicList(html);
      const metadata = parseEpisodeText(html);
      await saveProgramData(db, {
        program: { seriesId: seriesContentId, title: programTitle },
        episode,
        tracks,
        metadata,
        rawHash,
        status: (tracks.length || metadata.fullText) ? 'parsed' : 'no_tracks',
      });
      await onEpisode?.(episode, tracks, metadata);
      parsed += 1;
      tracksSaved += tracks.length;
      logger.log(`${episode.scheduledAt?.slice(0, 10) ?? 'unknown'} ${item.url}: ${tracks.length} tracks`);
    } catch (error: any) {
      failures += 1;
      await saveProgramData(db, {
        program: { seriesId: seriesContentId, title: programTitle },
        episode,
        tracks: [],
        metadata: {},
        status: 'failed',
        error: String(error),
      });
      logger.error(`Failed ${item.url}: ${error?.message}`);
    }
  }

  return {
    seriesContentId,
    programTitle,
    pages: discovered.pages,
    episodesSeen: selected.length,
    episodesParsed: parsed,
    tracksSaved,
    failures,
    refresh,
  };
}
