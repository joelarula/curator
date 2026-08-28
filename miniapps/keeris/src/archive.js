import { parseEpisodeDate } from './episode-parser.js';

export async function discoverEpisodes(client, { seriesContentId = '1037846', onPage } = {}) {
  const episodes = new Map();
  const isUrl = String(seriesContentId).startsWith('http://') || String(seriesContentId).startsWith('https://');

  if (isUrl) {
    const visitedUrls = new Set();
    const queue = [String(seriesContentId)];
    let pages = 0;

    while (queue.length > 0) {
      const url = queue.shift();
      if (visitedUrls.has(url)) continue;
      visitedUrls.add(url);
      pages += 1;
      onPage?.(pages);

      const match = url.match(/\/(\d+)/);
      const id = match ? Number(match[1]) : Date.now();

      try {
        const html = await client.episode(url);

        // Extract real broadcast date from the page
        const isoDate = parseEpisodeDate(html);
        const scheduleStart = isoDate ? Math.floor(new Date(isoDate).getTime() / 1000) : null;

        episodes.set(id, { id, url, scheduleStart });

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
      } catch (error) {
        episodes.set(id, { id, url, scheduleStart: null });
      }
    }
    return { episodes: [...episodes.values()], pages };
  }


  const cursors = new Set();
  let params = { seriesContentId };
  let pages = 0;
  while (true) {
    const response = await client.archive(params);
    pages += 1;
    onPage?.(pages, response);
    for (const episode of response.data ?? []) episodes.set(episode.id, episode);
    const cursor = response.previous;
    if (!cursor || cursors.has(cursor)) break;
    cursors.add(cursor);
    params = { seriesContentId, unixTime: cursor, previousBlock: 'true' };
  }
  return { episodes: [...episodes.values()], pages };
}

export function episodeDate(episode) {
  const timestamp = Number(episode.scheduleStart ?? episode.publicStart);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null;
}