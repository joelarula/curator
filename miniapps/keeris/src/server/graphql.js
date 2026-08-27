import { buildSchema, graphql } from 'graphql';

const schema = buildSchema(`
  type Episode { id: ID!, url: String!, title: String!, scheduledAt: String, publishedAt: String, parseStatus: String!, trackCount: Int! }
  type Track { id: ID!, position: Int!, artist: String, title: String, rawText: String!, date: String, episodeTitle: String!, episodeUrl: String! }
  type Stats { episodes: Int!, tracks: Int!, noTracks: Int!, oldest: String, newest: String }
  type Query { tracks(search: String, limit: Int, offset: Int): [Track!]!, episodes(limit: Int): [Episode!]!, stats: Stats! }
`);

function rowToTrack(row) {
  return {
    id: row.id,
    position: row.position,
    artist: row.artist,
    title: row.title,
    rawText: row.raw_text,
    date: row.date,
    episodeTitle: row.episodeTitle,
    episodeUrl: row.episodeUrl,
  };
}

function resolvers(db) {
  return {
    tracks: ({ search = '', limit = 100, offset = 0 }) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const needle = `%${String(search).trim().toLocaleLowerCase()}%`;
      return db.prepare(`SELECT t.id, t.position, t.artist, t.title, t.raw_text,
          e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl
        FROM tracks t JOIN episodes e ON e.id=t.episode_id
        WHERE lower(coalesce(t.artist, '') || ' ' || coalesce(t.title, '') || ' ' || t.raw_text) LIKE ?
        ORDER BY e.scheduled_at DESC, t.position LIMIT ? OFFSET ?`).all(needle, safeLimit, safeOffset).map(rowToTrack);
    },
    episodes: ({ limit = 100 }) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      return db.prepare(`SELECT e.*, COUNT(t.id) AS trackCount FROM episodes e
        LEFT JOIN tracks t ON t.episode_id=e.id GROUP BY e.id
        ORDER BY e.scheduled_at DESC LIMIT ?`).all(safeLimit).map((row) => ({
        id: row.id, url: row.url, title: row.title, scheduledAt: row.scheduled_at,
        publishedAt: row.published_at, parseStatus: row.parse_status, trackCount: row.trackCount,
      }));
    },
    stats: () => {
      const row = db.prepare(`SELECT COUNT(*) AS episodes, (SELECT COUNT(*) FROM tracks) AS tracks,
        (SELECT COUNT(*) FROM episodes WHERE parse_status='no_tracks') AS noTracks,
        MIN(scheduled_at) AS oldest, MAX(scheduled_at) AS newest FROM episodes`).get();
      return row;
    },
  };
}

export async function executeGraphql(db, source, variables = {}) {
  return graphql({ schema, source, rootValue: resolvers(db), variableValues: variables });
}

export { schema };