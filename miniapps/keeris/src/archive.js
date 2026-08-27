export async function discoverEpisodes(client, { onPage } = {}) {
  const episodes = new Map();
  const cursors = new Set();
  let params = {};
  let pages = 0;
  while (true) {
    const response = await client.archive(params);
    pages += 1;
    onPage?.(pages, response);
    for (const episode of response.data ?? []) episodes.set(episode.id, episode);
    const cursor = response.previous;
    if (!cursor || cursors.has(cursor)) break;
    cursors.add(cursor);
    params = { unixTime: cursor, previousBlock: 'true' };
  }
  return { episodes: [...episodes.values()], pages };
}

export function episodeDate(episode) {
  const timestamp = Number(episode.scheduleStart ?? episode.publicStart);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null;
}