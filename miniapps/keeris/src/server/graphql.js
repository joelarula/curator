import { buildSchema, graphql } from 'graphql';

const schema = buildSchema(`
  type Program { id: ID!, seriesId: String!, title: String!, slug: String, description: String, url: String }
  type EpisodeMetadata { id: ID!, description: String, fullText: String, summary: String, keywords: String }
  type Episode {
    id: ID!,
    url: String!,
    title: String!,
    scheduledAt: String,
    publishedAt: String,
    parseStatus: String!,
    trackCount: Int!,
    program: Program,
    metadata: EpisodeMetadata
  }
  type UniqueTrack {
    id: ID!,
    fingerprint: String!,
    artist: String,
    title: String,
    playCount: Int!,
    firstPlayedAt: String,
    lastPlayedAt: String,
    airings: [Track!]!
  }
  type Track {
    id: ID!,
    position: Int!,
    artist: String,
    title: String,
    rawText: String!,
    date: String,
    episodeTitle: String!,
    episodeUrl: String!,
    programTitle: String,
    episodeDescription: String,
    uniqueTrack: UniqueTrack
  }
  type ProgramStat {
    programId: ID!,
    programTitle: String!,
    episodes: Int!,
    tracks: Int!,
    uniqueTracks: Int!
  }
  type Stats {
    episodes: Int!,
    tracks: Int!,
    uniqueTracks: Int!,
    programs: Int!,
    noTracks: Int!,
    oldest: String,
    newest: String,
    programBreakdown: [ProgramStat!]!
  }
  type CuratorAgent { id: ID!, name: String!, ast: String, schedule: String, isActive: Boolean }
  type CuratorResponse { id: ID!, requestId: ID!, content: String, createdAt: String }
  type CuratorRequest { id: ID!, scriptId: ID, agentName: String, ast: String, createdAt: String, responses: [CuratorResponse!]! }
  type ScrapeResult { seriesContentId: String!, programTitle: String!, episodesSeen: Int!, episodesParsed: Int!, tracksSaved: Int!, failures: Int! }

  type Query {
    programs: [Program!]!,
    tracks(search: String, programId: ID, limit: Int, offset: Int): [Track!]!,
    uniqueTracks(search: String, limit: Int, offset: Int): [UniqueTrack!]!,
    episodes(search: String, programId: ID, limit: Int): [Episode!]!,
    stats: Stats!,
    curatorAgents: [CuratorAgent!]!,
    curatorRequests(limit: Int): [CuratorRequest!]!
  }

  type Mutation {
    triggerCuratorAgent(name: String!, refresh: Boolean): CuratorResponse!
    scrapeProgram(seriesContentId: String!, programTitle: String!, refresh: Boolean): ScrapeResult!
    updateEpisodeMetadata(episodeId: ID, url: String, description: String, fullText: String): EpisodeMetadata!
  }
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
    programTitle: row.programTitle ?? null,
    episodeDescription: row.episodeDescription ?? null,
    uniqueTrack: row.unique_track_id ? {
      id: row.unique_track_id,
      artist: row.uArtist ?? row.artist,
      title: row.uTitle ?? row.title,
      playCount: row.uPlayCount ?? 1
    } : null
  };
}

function resolvers(db) {
  return {
    programs: () => {
      return db.prepare('SELECT id, series_id AS seriesId, title, slug, description, url FROM programs ORDER BY title').all();
    },
    tracks: ({ search = '', programId, limit = 100, offset = 0 }) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const needle = `%${String(search).trim().toLocaleLowerCase()}%`;
      const filterProgram = programId ? 'AND e.program_id = ?' : '';
      const params = programId ? [needle, needle, programId, safeLimit, safeOffset] : [needle, needle, safeLimit, safeOffset];

      return db.prepare(`SELECT t.id, t.position, t.artist, t.title, t.raw_text, t.unique_track_id,
          e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle,
          m.description AS episodeDescription,
          ut.artist AS uArtist, ut.title AS uTitle, ut.play_count AS uPlayCount
        FROM tracks t
        JOIN episodes e ON e.id=t.episode_id
        LEFT JOIN programs p ON p.id=e.program_id
        LEFT JOIN unique_tracks ut ON ut.id=t.unique_track_id
        LEFT JOIN episode_metadata m ON m.episode_id=e.id
        WHERE (lower(coalesce(t.artist, '') || ' ' || coalesce(t.title, '') || ' ' || t.raw_text) LIKE ?
           OR lower(coalesce(m.description, '') || ' ' || coalesce(m.full_text, '')) LIKE ?)
          ${filterProgram}
        ORDER BY e.scheduled_at DESC, t.position LIMIT ? OFFSET ?`).all(...params).map(rowToTrack);
    },
    uniqueTracks: ({ search = '', limit = 100, offset = 0 }) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const term = String(search).trim().toLocaleLowerCase();
      const needle1 = `%${term}%`;
      const variant = term.replace(/kandaat/g, 'kantaat').replace(/kantaat/g, 'kandaat');
      const needle2 = `%${variant}%`;

      // 1. Direct track matches (Artist / Title) - ALWAYS PROCEED TEXT MATCHES, ordered by play_count DESC
      const trackRows = db.prepare(`SELECT DISTINCT ut.id, ut.fingerprint, ut.artist, ut.title, ut.play_count, ut.first_played_at, ut.last_played_at
        FROM unique_tracks ut
        WHERE (lower(coalesce(ut.artist, '') || ' ' || coalesce(ut.title, '')) LIKE ?
           OR lower(coalesce(ut.artist, '') || ' ' || coalesce(ut.title, '')) LIKE ?)
        ORDER BY ut.play_count DESC, ut.last_played_at DESC LIMIT ? OFFSET ?`).all(needle1, needle2, safeLimit, safeOffset);

      const formatted = trackRows.map((row) => ({
        id: row.id,
        fingerprint: row.fingerprint,
        artist: row.artist,
        title: row.title,
        playCount: row.play_count,
        firstPlayedAt: row.first_played_at,
        lastPlayedAt: row.last_played_at,
        airings: () => {
          return db.prepare(`SELECT t.id, t.position, t.artist, t.title, t.raw_text,
              e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle,
              m.description AS episodeDescription
            FROM tracks t JOIN episodes e ON e.id=t.episode_id
            LEFT JOIN programs p ON p.id=e.program_id
            LEFT JOIN episode_metadata m ON m.episode_id=e.id
            WHERE t.unique_track_id = ? ORDER BY e.scheduled_at DESC`).all(row.id).map(rowToTrack);
        }
      }));

      if (term.length > 0) {
        // 2. Episode text matches (only visible fields: e.title or m.description) - listed after track matches
        const epRows = db.prepare(`SELECT e.id, e.title AS episodeTitle, e.url AS episodeUrl, e.scheduled_at AS date,
            p.title AS programTitle, m.description AS episodeDescription
          FROM episodes e
          LEFT JOIN programs p ON p.id = e.program_id
          LEFT JOIN episode_metadata m ON m.episode_id = e.id
          WHERE (lower(coalesce(e.title, '') || ' ' || coalesce(m.description, '')) LIKE ?
             OR lower(coalesce(e.title, '') || ' ' || coalesce(m.description, '')) LIKE ?)
            AND e.id NOT IN (SELECT DISTINCT episode_id FROM tracks WHERE episode_id IS NOT NULL AND unique_track_id IS NOT NULL)
          ORDER BY e.scheduled_at DESC LIMIT ?`).all(needle1, needle2, safeLimit);

        for (const ep of epRows) {
          formatted.push({
            id: `ep-${ep.id}`,
            fingerprint: `ep-${ep.id}`,
            artist: ep.programTitle || 'Radio Episode',
            title: ep.episodeTitle,
            playCount: 1,
            firstPlayedAt: ep.date,
            lastPlayedAt: ep.date,
            airings: () => [{
              id: `air-${ep.id}`,
              position: 1,
              artist: ep.programTitle || 'Radio Episode',
              title: ep.episodeTitle,
              rawText: ep.episodeTitle,
              date: ep.date,
              episodeTitle: ep.episodeTitle,
              episodeUrl: ep.episodeUrl,
              programTitle: ep.programTitle,
              episodeDescription: ep.episodeDescription,
            }]
          });
        }
      }

      return formatted;
    },
    episodes: ({ search = '', programId, limit = 100 }) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const needle = `%${String(search).trim().toLocaleLowerCase()}%`;
      const filterProgram = programId ? 'AND e.program_id = ?' : '';
      const params = programId ? [needle, needle, programId, safeLimit] : [needle, needle, safeLimit];

      const rows = db.prepare(`SELECT e.*, COUNT(t.id) AS trackCount, p.series_id AS pSeriesId, p.title AS pTitle,
          m.id AS mId, m.description AS mDesc, m.full_text AS mFullText, m.summary AS mSummary
        FROM episodes e
        LEFT JOIN tracks t ON t.episode_id=e.id
        LEFT JOIN programs p ON p.id=e.program_id
        LEFT JOIN episode_metadata m ON m.episode_id=e.id
        WHERE (lower(e.title || ' ' || coalesce(m.description, '') || ' ' || coalesce(m.full_text, '')) LIKE ?
           OR lower(coalesce(t.artist, '') || ' ' || coalesce(t.title, '')) LIKE ?)
          ${filterProgram}
        GROUP BY e.id
        ORDER BY e.scheduled_at DESC LIMIT ?`).all(...params);

      return rows.map((row) => ({
        id: row.id,
        url: row.url,
        title: row.title,
        scheduledAt: row.scheduled_at,
        publishedAt: row.published_at,
        parseStatus: row.parse_status,
        trackCount: row.trackCount,
        program: row.program_id ? { id: row.program_id, seriesId: row.pSeriesId, title: row.pTitle } : null,
        metadata: row.mId ? { id: row.mId, description: row.mDesc, fullText: row.mFullText, summary: row.mSummary } : null,
      }));
    },
    stats: () => {
      const row = db.prepare(`SELECT COUNT(*) AS episodes,
        (SELECT COUNT(*) FROM tracks) AS tracks,
        (SELECT COUNT(*) FROM unique_tracks) AS uniqueTracks,
        (SELECT COUNT(*) FROM programs) AS programs,
        (SELECT COUNT(*) FROM episodes WHERE parse_status='no_tracks') AS noTracks,
        MIN(scheduled_at) AS oldest, MAX(scheduled_at) AS newest FROM episodes`).get();

      const programBreakdown = db.prepare(`SELECT p.id AS programId, p.title AS programTitle,
          COUNT(DISTINCT e.id) AS episodes,
          COUNT(t.id) AS tracks,
          COUNT(DISTINCT t.unique_track_id) AS uniqueTracks
        FROM programs p
        LEFT JOIN episodes e ON e.program_id = p.id
        LEFT JOIN tracks t ON t.episode_id = e.id
        GROUP BY p.id, p.title
        ORDER BY uniqueTracks DESC, episodes DESC`).all();

      return {
        ...row,
        programBreakdown,
      };
    },
    curatorAgents: async () => {
      const { startCuratorRuntime } = await import('../curator-runtime.js');
      const runtime = await startCuratorRuntime({ databaseName: 'keeris' });
      const agents = await runtime.prisma.agent.findMany({ include: { script: true } });
      await runtime.stop();
      return agents.map((a) => {
        const astObj = typeof a.script?.ast === 'object' ? a.script.ast : JSON.parse(a.script?.ast || '{}');
        return {
          id: a.id,
          name: a.name,
          ast: JSON.stringify(astObj),
          schedule: astObj.schedule ?? '0 * * * *',
          isActive: astObj.isActive ?? false,
        };
      });
    },
    curatorRequests: async ({ limit = 20 }) => {
      const { startCuratorRuntime } = await import('../curator-runtime.js');
      const runtime = await startCuratorRuntime({ databaseName: 'keeris' });
      const requests = await runtime.prisma.request.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(Number(limit) || 20, 1), 100),
        include: { responses: true, script: true },
      });
      await runtime.stop();
      return requests.map((r) => ({
        id: r.id,
        scriptId: r.scriptId,
        agentName: r.script?.name ?? 'unknown',
        ast: JSON.stringify(r.ast),
        createdAt: r.createdAt ? r.createdAt.toISOString() : null,
        responses: r.responses.map((res) => ({
          id: res.id,
          requestId: res.requestId,
          content: res.content,
          createdAt: res.createdAt ? res.createdAt.toISOString() : null,
        })),
      }));
    },
    triggerCuratorAgent: async ({ name, refresh = false }) => {
      const { startCuratorRuntime } = await import('../curator-runtime.js');
      const { createErrRadioPlugin } = await import('../plugins/err-radio.js');
      const runtime = await startCuratorRuntime({ databaseName: 'keeris' });

      const req = await runtime.triggerAgent(name, { refresh });
      const plugin = createErrRadioPlugin(db);
      const toolName = req.ast?.toolName ?? 'vikerraadio_scrape';
      const tool = plugin.tools[toolName];
      if (!tool) throw new Error(`Tool '${toolName}' not found`);

      const result = await tool.runAsync({ args: req.ast?.args ?? {} });
      const resp = await runtime.prisma.response.create({
        data: {
          request: { connect: { id: req.id } },
          conversation: { connect: { id: req.conversationId } },
          content: `Indexed ${result.episodesParsed} episodes (${result.tracksSaved} tracks saved) for ${result.programTitle} successfully.`,
        },
      });
      await runtime.stop();
      return {
        id: resp.id,
        requestId: req.id,
        content: resp.content,
        createdAt: resp.createdAt ? resp.createdAt.toISOString() : new Date().toISOString(),
      };
    },
    scrapeProgram: async ({ seriesContentId, programTitle, refresh = false }) => {
      const { createErrRadioPlugin } = await import('../plugins/err-radio.js');
      const plugin = createErrRadioPlugin(db);
      const result = await plugin.tools.vikerraadio_scrape.runAsync({
        args: { seriesContentId, programTitle, refresh },
      });
      return result;
    },
    updateEpisodeMetadata: (args) => {
      console.log('[DEBUG updateEpisodeMetadata args]', args);
      const { episodeId, url, description, fullText } = args || {};
      let epId = episodeId;
      if (!epId && url) {
        const ep = db.prepare('SELECT id FROM episodes WHERE url = ? OR url LIKE ? OR cast(id as text) = ?').get(url, `%${url}%`, url);
        if (ep) epId = ep.id;
      }
      if (!epId && url) {
        const match = url.match(/\/(\d+)/);
        if (match) {
          const ep = db.prepare('SELECT id FROM episodes WHERE id = ? OR url LIKE ?').get(Number(match[1]), `%${match[1]}%`);
          if (ep) epId = ep.id;
        }
      }
      if (!epId) throw new Error('Episode not found');

      const existing = db.prepare('SELECT id FROM episode_metadata WHERE episode_id = ?').get(epId);
      if (existing) {
        db.prepare('UPDATE episode_metadata SET description = coalesce(?, description), full_text = coalesce(?, full_text), summary = coalesce(?, summary) WHERE episode_id = ?')
          .run(description ?? null, fullText ?? null, description ? description.slice(0, 500) : null, epId);
      } else {
        db.prepare('INSERT INTO episode_metadata (episode_id, description, full_text, summary) VALUES (?, ?, ?, ?)')
          .run(epId, description ?? null, fullText ?? null, description ? description.slice(0, 500) : null);
      }

      const meta = db.prepare('SELECT id, description, full_text AS fullText, summary FROM episode_metadata WHERE episode_id = ?').get(epId);
      return { id: meta.id, description: meta.description, fullText: meta.fullText, summary: meta.summary };
    },
  };
}

export async function executeGraphql(db, source, variables = {}) {
  return graphql({ schema, source, rootValue: resolvers(db), variableValues: variables });
}

export { schema };