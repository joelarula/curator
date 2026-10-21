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
    : async (items: DiscoveredEpisode[]) => {
        for (const item of items) {
          const row: any = await db.prepare('SELECT parse_status FROM episodes WHERE id = ?').get(item.id);
          if (row && ['parsed', 'no_tracks'].includes(row.parse_status)) {
            return true;
          }
        }
        return false;
      };

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
    const existing: any = await db.prepare('SELECT parse_status FROM episodes WHERE id = ?').get(item.id);
    if (!refresh && existing && ['parsed', 'no_tracks'].includes(existing.parse_status)) continue;

    try {
      let tracks: ParsedTrack[] = [];
      let metadata: ParsedEpisodeText = { description: null, fullText: null, summary: null, keywords: null };
      let rawHash: string | null = null;

      // If client has native getContent method and item has an id, fetch structured content directly
      if (typeof (client as any).getContent === 'function' && item.id) {
        try {
          const res = await (client as any).getContent(item.id);
          const cData = res?.data?.content;
          if (cData) {
            rawHash = createHash('sha256').update(JSON.stringify(res)).digest('hex');
            if (cData.combinedTime) {
              episode.scheduledAt = new Date(cData.combinedTime * 1000).toISOString();
            }
            if (cData.publicStart) {
              episode.publishedAt = new Date(cData.publicStart * 1000).toISOString();
            }
            if (cData.url) {
              episode.url = new URL(cData.url, 'https://eestiraadio.err.ee').toString();
            }
            if (cData.heading) {
              episode.heading = cData.heading;
              (episode as any).title = cData.heading;
            }

            const playlist = res?.data?.playlist;
            if (Array.isArray(playlist) && playlist.length > 0) {
              tracks = playlist.map((p: any, idx: number) => ({
                position: idx + 1,
                artist: p.artist || null,
                title: p.title || null,
                rawText: [p.artist, p.title].filter(Boolean).join(' - '),
              }));
            } else if (cData.body) {
              tracks = parseMusicList(cData.body);
            }

            const bodyParsed = parseEpisodeText(cData.body || '');
            metadata = {
              description: cData.lead || bodyParsed.description || null,
              fullText: bodyParsed.fullText || cData.lead || null,
              summary: cData.lead?.slice(0, 500) || bodyParsed.summary || null,
              keywords: null,
            };
          }
        } catch (_) {}
      }

      // Fallback to client.episode(item.url) if no tracks were obtained from getContent
      if (tracks.length === 0 && !metadata.fullText) {
        const html = await client.episode(item.url);
        rawHash = rawHash || createHash('sha256').update(html).digest('hex');
        tracks = parseMusicList(html);
        metadata = parseEpisodeText(html);
      }

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
      logger.log(`${episode.scheduledAt?.slice(0, 10) ?? 'unknown'} ${episode.url || item.url}: ${tracks.length} tracks`);
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
