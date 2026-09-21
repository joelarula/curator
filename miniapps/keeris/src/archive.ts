import { parseEpisodeDate } from './episode-parser.ts';
import { ErrClient, type ErrArchiveBroadcast } from './err-client.ts';

export interface DiscoveredEpisode {
  id: number | string;
  url: string;
  scheduleStart: number | null;
  publicStart?: number | null;
  heading?: string;
  [key: string]: unknown;
}

export interface DiscoverEpisodesOptions {
  seriesContentId?: string | number;
  onPage?: (pages: number, response?: unknown) => void;
  shouldStop?: (items: any[]) => boolean;
}

export interface DiscoverEpisodesResult {
  episodes: DiscoveredEpisode[];
  pages: number;
}

export async function discoverEpisodes(
  client: ErrClient,
  { seriesContentId = '1037846', onPage, shouldStop }: DiscoverEpisodesOptions = {}
): Promise<DiscoverEpisodesResult> {
  const episodes = new Map<string | number, DiscoveredEpisode>();
  const isUrl = String(seriesContentId).startsWith('http://') || String(seriesContentId).startsWith('https://');

  if (isUrl) {
    const visitedUrls = new Set<string>();
    const queue = [String(seriesContentId)];
    let pages = 0;

    while (queue.length > 0) {
      const url = queue.shift()!;
      if (visitedUrls.has(url)) continue;
      visitedUrls.add(url);
      pages += 1;
      onPage?.(pages);

      const matches = [...url.matchAll(/\/(\d+)/g)];
      const id = matches.length > 0 ? Number(matches[matches.length - 1][1]) : Date.now();

      try {
        const html = await client.episode(url);

        // Extract real broadcast date from the page
        const isoDate = parseEpisodeDate(html);
        const scheduleStart = isoDate ? Math.floor(new Date(isoDate).getTime() / 1000) : null;
        const epObj: DiscoveredEpisode = { id, url, scheduleStart };

        episodes.set(id, epObj);

        if (shouldStop?.([epObj])) break;

        const jsonMatch = html.match(/<script id="carouselJsonStruct" type="application\/ld\+json">(.*?)<\/script>/s);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[1]);
          const items = data.itemListElement || [];
          for (const item of items) {
            if (item.url && !visitedUrls.has(item.url)) {
              queue.push(item.url);
            }
          }
        }
      } catch (_error) {
        episodes.set(id, { id, url, scheduleStart: null });
      }
    }
    return { episodes: [...episodes.values()], pages };
  }

  const cursors = new Set<string>();
  let params: Record<string, unknown> = { seriesContentId };
  let pages = 0;
  while (true) {
    const response = await client.archive(params);
    pages += 1;
    onPage?.(pages, response);
    const items = (response.data ?? []) as DiscoveredEpisode[];
    for (const episode of items) episodes.set(episode.id, episode);
    
    if (shouldStop?.(items)) break;

    const cursor = response.previous;
    if (!cursor || cursors.has(cursor)) break;
    cursors.add(cursor);
    params = { seriesContentId, unixTime: cursor, previousBlock: 'true' };
  }
  return { episodes: [...episodes.values()], pages };
}

export function episodeDate(episode: DiscoveredEpisode | Record<string, unknown>): string | null {
  const timestamp = Number(episode.scheduleStart ?? episode.publicStart);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null;
}
