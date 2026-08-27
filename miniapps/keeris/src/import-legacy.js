import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { openDatabase, saveEpisode } from './db.js';

function episodeId(url) {
  const numericId = url.match(/err\.ee\/(\d+)/)?.[1];
  if (numericId) return Number(numericId);
  return -Math.abs(createHash('sha1').update(url).digest().readInt32BE(0));
}

export async function importLegacyJson(input, database, { onEpisode, onEpisodes, onProgress, batchSize = 100 } = {}) {
  const rows = JSON.parse(readFileSync(input, 'utf8'));
  const episodes = new Map();
  for (const row of rows) {
    if (!row.episodeUrl) continue;
    const id = episodeId(row.episodeUrl);
    const episode = episodes.get(id) ?? {
      id,
      url: row.episodeUrl,
      heading: row.episodeTitle ?? 'Kauamängiv',
      scheduledAt: row.date ?? null,
      publishedAt: null,
    };
    episode.tracks ??= [];
    episode.tracks.push({ position: row.position, artist: row.artist, title: row.title, rawText: row.rawText ?? `${row.artist ?? ''} - ${row.title ?? ''}` });
    episodes.set(id, episode);
  }
  let completedEpisodes = 0;
  let migratedTracks = 0;
  await onProgress?.({ phase: 'running', totalEpisodes: episodes.size, totalTracks: rows.length, completedEpisodes, migratedTracks });
  const episodeList = [...episodes.values()];
  for (let offset = 0; offset < episodeList.length; offset += batchSize) {
    const batch = episodeList.slice(offset, offset + batchSize);
    if (onEpisodes) await onEpisodes(batch);
    for (const episode of batch) {
      saveEpisode(database, episode, episode.tracks, { status: episode.tracks.length ? 'parsed' : 'no_tracks' });
      await onEpisode?.(episode, episode.tracks);
      completedEpisodes += 1;
      migratedTracks += episode.tracks.length;
    }
    await onProgress?.({ phase: 'running', totalEpisodes: episodes.size, totalTracks: rows.length, completedEpisodes, migratedTracks, currentEpisode: batch.at(-1)?.id });
  }
  /*
  for (const episode of episodes.values()) {
    saveEpisode(database, episode, episode.tracks, { status: episode.tracks.length ? 'parsed' : 'no_tracks' });
    await onEpisode?.(episode, episode.tracks);
    completedEpisodes += 1;
    migratedTracks += episode.tracks.length;
    await onProgress?.({ phase: 'running', totalEpisodes: episodes.size, totalTracks: rows.length, completedEpisodes, migratedTracks, currentEpisode: episode.id });
  }
  */
  await onProgress?.({ phase: 'complete', totalEpisodes: episodes.size, totalTracks: rows.length, completedEpisodes, migratedTracks });
  return { episodes: episodes.size, tracks: rows.length };
}

if (process.argv[1]?.endsWith('import-legacy.js')) {
  const input = process.argv[2] ?? 'web/public/tracks.json';
  const database = openDatabase(process.env.DATABASE_PATH ?? 'data/kauamangiv.sqlite');
  console.log(JSON.stringify(await importLegacyJson(input, database), null, 2));
  database.close();
}