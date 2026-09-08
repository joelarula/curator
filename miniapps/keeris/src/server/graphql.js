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
  type CuratorAgent { id: ID!, name: String!, ast: String, schedule: String, isActive: Boolean, enabled: Boolean }
  type CuratorResponse { id: ID!, requestId: ID!, content: String, createdAt: String }
  type CuratorRequest { id: ID!, scriptId: ID, agentName: String, ast: String, createdAt: String, responses: [CuratorResponse!]! }
  type ScrapeResult { seriesContentId: String!, programTitle: String!, episodesSeen: Int!, episodesParsed: Int!, tracksSaved: Int!, failures: Int! }
  type EpisodeDownloadResult { downloaded: Boolean!, episodeUrl: String!, audioUrl: String!, filePath: String!, fileName: String!, fileSizeMB: String }

  type PlaylistItem {
    id: ID!
    playlistId: ID!
    position: Int!
    notes: String
    createdAt: String
    uniqueTrack: UniqueTrack
    track: Track
    episode: Episode
  }

  type Playlist {
    id: ID!
    title: String!
    description: String
    createdAt: String
    updatedAt: String
    itemCount: Int!
    items: [PlaylistItem!]!
  }

  type EpisodeMatch {
    episode: Episode!
    matchedTrackCount: Int!
    totalPlaylistTracks: Int!
    matchPercentage: Float!
  }

  type Query {
    programs: [Program!]!,
    tracks(search: String, programId: ID, limit: Int, offset: Int): [Track!]!,
    uniqueTracks(search: String, programIds: [ID!], limit: Int, offset: Int): [UniqueTrack!]!,
    episodes(search: String, programId: ID, limit: Int): [Episode!]!,
    stats: Stats!,
    curatorAgents: [CuratorAgent!]!,
    curatorRequests(limit: Int): [CuratorRequest!]!,
    playlists: [Playlist!]!,
    playlist(id: ID!): Playlist,
    episodesContainingPlaylist(playlistId: ID!): [EpisodeMatch!]!
  }

  type Mutation {
    triggerCuratorAgent(name: String!, refresh: Boolean): CuratorResponse!
    scrapeProgram(seriesContentId: String!, programTitle: String!, refresh: Boolean): ScrapeResult!
    updateEpisodeMetadata(episodeId: ID, url: String, description: String, fullText: String): EpisodeMetadata!
    downloadEpisode(url: String!, fileName: String): EpisodeDownloadResult!
    createPlaylist(title: String!, description: String): Playlist!
    updatePlaylist(id: ID!, title: String, description: String): Playlist!
    deletePlaylist(id: ID!): Boolean!
    addItemToPlaylist(playlistId: ID!, uniqueTrackId: ID, trackId: ID, episodeId: ID, notes: String): PlaylistItem!
    removeItemFromPlaylist(itemId: ID!): Boolean!
    reorderPlaylistItems(playlistId: ID!, itemIds: [ID!]!): Playlist!
  }
`);

function cleanEpisodeDescription(desc, episodeTitle, programTitle) {
  if (!desc) return null;
  let str = String(desc).trim();
  if (!str) return null;
  const progName = programTitle ? programTitle.trim() : '';
  const epName = episodeTitle ? episodeTitle.trim() : '';
  const plain = str.replace(/\|\s*(Klassikaraadio|Vikerraadio|Raadio 2|Raadio 4|Raadio Tallinn|ERR)\s*/gi, '').trim();
  if (plain === progName || plain === epName) return null;
  if (progName && str.toLowerCase().startsWith(progName.toLowerCase() + ' |')) {
    str = str.slice(progName.length + 2).trim();
  }
  if (epName && str.toLowerCase().startsWith(epName.toLowerCase() + ' |')) {
    str = str.slice(epName.length + 2).trim();
  }
  str = str.replace(/^(Klassikaraadio|Vikerraadio|Raadio 2|Raadio 4|Raadio Tallinn|ERR)\s*\|\s*/i, '').trim();
  if (!str || str === progName || str === epName) return null;
  return str;
}

function rowToTrack(row) {
  const epTitle = row.episodeTitle ?? row.episodetitle ?? row.episode_title;
  const progTitle = row.programTitle ?? row.programtitle ?? row.program_title ?? null;
  const rawDesc = row.episodeDescription ?? row.episodedescription ?? row.episode_description ?? null;
  return {
    id: row.id,
    position: row.position,
    artist: row.artist,
    title: row.title,
    rawText: row.rawText ?? row.rawtext ?? row.raw_text,
    date: row.date,
    episodeTitle: epTitle,
    episodeUrl: row.episodeUrl ?? row.episodeurl ?? row.episode_url,
    programTitle: progTitle,
    episodeDescription: cleanEpisodeDescription(rawDesc, epTitle, progTitle),
    uniqueTrack: row.unique_track_id ? {
      id: row.unique_track_id,
      artist: row.uArtist ?? row.uartist ?? row.artist,
      title: row.uTitle ?? row.utitle ?? row.title,
      playCount: row.uPlayCount ?? row.uplaycount ?? 1
    } : null
  };
}

function normalizeText(text) {
  if (text == null) return '';
  return String(text).normalize('NFC').toLowerCase();
}

function resolvers(db, { curatorRuntime } = {}) {
  try {
    if (typeof db.function === 'function') {
      db.function('norm_text', (text) => normalizeText(text));
      db.function('lower_utf', (text) => (text == null ? '' : String(text).toLocaleLowerCase('et-EE')));
    }
  } catch (_) {}

  return {
    programs: async () => {
      const rows = await db.prepare('SELECT id, series_id AS seriesId, title, slug, description, url FROM programs ORDER BY title').all();
      return rows;
    },
    tracks: async ({ search = '', programId, limit = 100, offset = 0 }) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const cleanSearch = String(search || '').trim();

      if (cleanSearch.length > 0) {
        const needle = `%${normalizeText(cleanSearch)}%`;
        const filterProgram = programId ? 'AND e.program_id = ?' : '';
        const params = programId ? [needle, needle, programId, safeLimit, safeOffset] : [needle, needle, safeLimit, safeOffset];

        const rows = await db.prepare(`SELECT t.id, t.position, t.artist, t.title, t.raw_text, t.unique_track_id,
            e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle,
            COALESCE(NULLIF(m.description, ''), m.summary) AS episodeDescription,
            ut.artist AS uArtist, ut.title AS uTitle, ut.play_count AS uPlayCount
          FROM tracks t
          JOIN episodes e ON e.id=t.episode_id
          LEFT JOIN programs p ON p.id=e.program_id
          LEFT JOIN unique_tracks ut ON ut.id=t.unique_track_id
          LEFT JOIN episode_metadata m ON m.episode_id=e.id
          WHERE (LOWER(coalesce(t.artist, '') || ' ' || coalesce(t.title, '') || ' ' || t.raw_text) LIKE LOWER(?)
             OR LOWER(coalesce(m.description, '') || ' ' || coalesce(m.full_text, '')) LIKE LOWER(?))
            ${filterProgram}
          ORDER BY e.scheduled_at DESC, t.position LIMIT ? OFFSET ?`).all(...params);
        return rows.map(rowToTrack);
      }

      const filterProgram = programId ? 'WHERE e.program_id = ?' : '';
      const params = programId ? [programId, safeLimit, safeOffset] : [safeLimit, safeOffset];
      const rows = await db.prepare(`SELECT t.id, t.position, t.artist, t.title, t.raw_text, t.unique_track_id,
          e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle,
          COALESCE(NULLIF(m.description, ''), m.summary) AS episodeDescription,
          ut.artist AS uArtist, ut.title AS uTitle, ut.play_count AS uPlayCount
        FROM tracks t
        JOIN episodes e ON e.id=t.episode_id
        LEFT JOIN programs p ON p.id=e.program_id
        LEFT JOIN unique_tracks ut ON ut.id=t.unique_track_id
        LEFT JOIN episode_metadata m ON m.episode_id=e.id
        ${filterProgram}
        ORDER BY e.scheduled_at DESC, t.position LIMIT ? OFFSET ?`).all(...params);
      return rows.map(rowToTrack);
    },
    uniqueTracks: async ({ search = '', programIds = null, limit = 100, offset = 0 }) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const cleanSearch = String(search || '').trim();

      const validProgramIds = Array.isArray(programIds)
        ? programIds.map((id) => Number(id)).filter((id) => !isNaN(id) && id > 0)
        : [];

      let progCondition = '';
      let progParams = [];

      if (validProgramIds.length > 0) {
        const placeholders = validProgramIds.map(() => '?').join(',');
        progCondition = `AND ut.id IN (SELECT DISTINCT t.unique_track_id FROM tracks t JOIN episodes e ON e.id = t.episode_id WHERE e.program_id IN (${placeholders}))`;
        progParams = validProgramIds;
      }

      let trackRows;
      if (cleanSearch.length > 0) {
        const needle = `%${normalizeText(cleanSearch)}%`;
        trackRows = await db.prepare(`SELECT ut.id, ut.fingerprint, ut.artist, ut.title, ut.play_count, ut.first_played_at, ut.last_played_at
          FROM unique_tracks ut
          WHERE LOWER(coalesce(ut.artist, '') || ' ' || coalesce(ut.title, '')) LIKE LOWER(?)
          ${progCondition}
          ORDER BY ut.play_count DESC, ut.last_played_at DESC LIMIT ? OFFSET ?`).all(needle, ...progParams, safeLimit, safeOffset);
      } else {
        trackRows = await db.prepare(`SELECT ut.id, ut.fingerprint, ut.artist, ut.title, ut.play_count, ut.first_played_at, ut.last_played_at
          FROM unique_tracks ut
          WHERE 1=1 ${progCondition}
          ORDER BY ut.play_count DESC, ut.last_played_at DESC LIMIT ? OFFSET ?`).all(...progParams, safeLimit, safeOffset);
      }

      const formatted = trackRows.map((row) => ({
        id: row.id,
        fingerprint: row.fingerprint,
        artist: row.artist,
        title: row.title,
        playCount: row.play_count,
        firstPlayedAt: row.first_played_at,
        lastPlayedAt: row.last_played_at,
        airings: async () => {
          let airProgCond = '';
          let airParams = [row.id];
          if (validProgramIds.length > 0) {
            const placeholders = validProgramIds.map(() => '?').join(',');
            airProgCond = `AND e.program_id IN (${placeholders})`;
            airParams.push(...validProgramIds);
          }
          const airRows = await db.prepare(`SELECT t.id, t.position, t.artist, t.title, t.raw_text,
              e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle,
              COALESCE(NULLIF(m.description, ''), m.summary) AS episodeDescription
            FROM tracks t JOIN episodes e ON e.id=t.episode_id
            LEFT JOIN programs p ON p.id=e.program_id
            LEFT JOIN episode_metadata m ON m.episode_id=e.id
            WHERE t.unique_track_id = ? ${airProgCond} ORDER BY e.scheduled_at DESC`).all(...airParams);
          return airRows.map(rowToTrack);
        }
      }));

      if (cleanSearch.length > 0) {
        const needle = `%${normalizeText(cleanSearch)}%`;
        const progFilterEp = validProgramIds.length > 0
          ? `AND e.program_id IN (${validProgramIds.map(() => '?').join(',')})`
          : '';
        const epParams = validProgramIds.length > 0
          ? [needle, ...validProgramIds, safeLimit]
          : [needle, safeLimit];

        const epRows = await db.prepare(`SELECT e.id, e.title AS episodeTitle, e.url AS episodeUrl, e.scheduled_at AS date,
            p.title AS programTitle, COALESCE(NULLIF(m.description, ''), m.summary) AS episodeDescription
          FROM episodes e
          LEFT JOIN programs p ON p.id = e.program_id
          LEFT JOIN episode_metadata m ON m.episode_id = e.id
          WHERE (LOWER(coalesce(e.title, '') || ' ' || coalesce(m.description, '') || ' ' || coalesce(m.full_text, '')) LIKE LOWER(?))
            ${progFilterEp}
          ORDER BY e.scheduled_at DESC LIMIT ?`).all(...epParams);

        for (const ep of epRows) {
          const epTitle = ep.episodeTitle ?? ep.episodetitle ?? ep.title ?? 'ERR Saade';
          const epUrl = ep.episodeUrl ?? ep.episodeurl ?? ep.url ?? '';
          const progTitle = ep.programTitle ?? ep.programtitle ?? null;
          const epDesc = ep.episodeDescription ?? ep.episodedescription ?? null;
          const epDate = ep.date ?? ep.scheduled_at ?? null;

          formatted.push({
            id: `ep-${ep.id}`,
            fingerprint: `ep-${ep.id}`,
            artist: progTitle || 'ERR Arhiiv',
            title: epTitle,
            playCount: 1,
            firstPlayedAt: epDate,
            lastPlayedAt: epDate,
            airings: async () => {
              const epTracks = await db.prepare(`SELECT t.id, t.position, t.artist, t.title, t.raw_text,
                  e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle,
                  COALESCE(NULLIF(m.description, ''), m.summary) AS episodeDescription,
                  ut.artist AS uArtist, ut.title AS uTitle, ut.play_count AS uPlayCount
                FROM tracks t
                JOIN episodes e ON e.id = t.episode_id
                LEFT JOIN programs p ON p.id = e.program_id
                LEFT JOIN unique_tracks ut ON ut.id = t.unique_track_id
                LEFT JOIN episode_metadata m ON m.episode_id = e.id
                WHERE t.episode_id = ? ORDER BY t.position`).all(ep.id);

              if (epTracks.length > 0) return epTracks.map(rowToTrack);

              return [{
                id: `ep-air-${ep.id}`,
                position: 1,
                artist: progTitle || 'ERR Arhiiv',
                title: epTitle,
                rawText: epTitle,
                date: epDate,
                episodeTitle: epTitle,
                episodeUrl: epUrl,
                programTitle: progTitle,
                episodeDescription: epDesc,
                uniqueTrack: null,
              }];
            }
          });
        }
      }

      return formatted;
    },
    episodes: async ({ search = '', programId, limit = 100 }) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const cleanSearch = String(search || '').trim();

      let rows;
      if (cleanSearch.length > 0) {
        const needle = `%${normalizeText(cleanSearch)}%`;
        const filterProgram = programId ? 'AND e.program_id = ?' : '';
        const params = programId ? [needle, needle, programId, safeLimit] : [needle, needle, safeLimit];

        rows = await db.prepare(`SELECT e.*, COUNT(t.id) AS trackCount, p.series_id AS pSeriesId, p.title AS pTitle,
            m.id AS mId, m.description AS mDesc, m.full_text AS mFullText, m.summary AS mSummary
          FROM episodes e
          LEFT JOIN tracks t ON t.episode_id=e.id
          LEFT JOIN programs p ON p.id=e.program_id
          LEFT JOIN episode_metadata m ON m.episode_id=e.id
          WHERE (LOWER(coalesce(e.title, '')) LIKE LOWER(?)
             OR LOWER(coalesce(m.description, '') || ' ' || coalesce(m.full_text, '')) LIKE LOWER(?))
            ${filterProgram}
          GROUP BY e.id, p.series_id, p.title, m.id, m.description, m.full_text, m.summary
          ORDER BY e.scheduled_at DESC, e.id DESC
          LIMIT ?`).all(...params);
      } else {
        const filterProgram = programId ? 'WHERE e.program_id = ?' : '';
        const params = programId ? [programId, safeLimit] : [safeLimit];

        rows = await db.prepare(`SELECT e.*, COUNT(t.id) AS trackCount, p.series_id AS pSeriesId, p.title AS pTitle,
            m.id AS mId, m.description AS mDesc, m.full_text AS mFullText, m.summary AS mSummary
          FROM episodes e
          LEFT JOIN tracks t ON t.episode_id=e.id
          LEFT JOIN programs p ON p.id=e.program_id
          LEFT JOIN episode_metadata m ON m.episode_id=e.id
          ${filterProgram}
          GROUP BY e.id, p.series_id, p.title, m.id, m.description, m.full_text, m.summary
          ORDER BY e.scheduled_at DESC, e.id DESC
          LIMIT ?`).all(...params);
      }

      return rows.map((row) => ({
        id: row.id,
        url: row.url,
        title: row.title,
        scheduledAt: row.scheduled_at,
        publishedAt: row.published_at,
        parseStatus: row.parse_status,
        trackCount: Number(row.trackCount || row.trackcount || 0),
        program: row.program_id ? { id: row.program_id, seriesId: row.pseriesid ?? row.pSeriesId, title: row.ptitle ?? row.pTitle } : null,
        metadata: (row.mid ?? row.mId) ? { id: row.mid ?? row.mId, description: row.mdesc ?? row.mDesc, fullText: row.mfulltext ?? row.mFullText, summary: row.msummary ?? row.mSummary } : null,
      }));
    },
    stats: async () => {
      const row = await db.prepare(`SELECT COUNT(*) AS episodes,
        (SELECT COUNT(*) FROM tracks) AS tracks,
        (SELECT COUNT(*) FROM unique_tracks) AS uniqueTracks,
        (SELECT COUNT(*) FROM programs) AS programs,
        (SELECT COUNT(*) FROM episodes WHERE parse_status='no_tracks') AS noTracks,
        MIN(scheduled_at) AS oldest, MAX(scheduled_at) AS newest FROM episodes`).get();

      const programBreakdown = await db.prepare(`SELECT p.id AS programId, p.title AS programTitle,
          COUNT(DISTINCT e.id) AS episodes,
          COUNT(t.id) AS tracks,
          COUNT(DISTINCT t.unique_track_id) AS uniqueTracks
        FROM programs p
        LEFT JOIN episodes e ON e.program_id = p.id
        LEFT JOIN tracks t ON t.episode_id = e.id
        GROUP BY p.id, p.title
        ORDER BY uniqueTracks DESC, episodes DESC`).all();

      return {
        episodes: Number(row.episodes || 0),
        tracks: Number(row.tracks || 0),
        uniqueTracks: Number(row.uniquetracks || row.uniqueTracks || 0),
        programs: Number(row.programs || 0),
        noTracks: Number(row.notracks || row.noTracks || 0),
        oldest: row.oldest,
        newest: row.newest,
        programBreakdown: programBreakdown.map(p => ({
          programId: p.programid ?? p.programId,
          programTitle: p.programtitle ?? p.programTitle,
          episodes: Number(p.episodes || 0),
          tracks: Number(p.tracks || 0),
          uniqueTracks: Number(p.uniquetracks ?? p.uniqueTracks ?? 0)
        })),
      };
    },
    curatorAgents: async () => {
      let runtime = curatorRuntime;
      let shouldStop = false;
      if (!runtime) {
        const { startCuratorRuntime } = await import('../curator-runtime.js');
        runtime = await startCuratorRuntime({ databaseName: 'keeris', keerisDb: db });
        shouldStop = true;
      }
      const agents = await runtime.prisma.agent.findMany({ include: { script: true } });
      if (shouldStop) await runtime.stop();
      return agents.map((a) => {
        const astObj = typeof a.script?.ast === 'object' ? a.script.ast : JSON.parse(a.script?.ast || '{}');
        const isAgentEnabled = a.enabled ?? (astObj.enabled ?? astObj.isActive ?? false);
        return {
          id: a.id,
          name: a.name,
          ast: JSON.stringify(astObj),
          schedule: a.schedule ?? astObj.schedule ?? '0 * * * *',
          isActive: isAgentEnabled,
          enabled: isAgentEnabled,
        };
      });
    },
    curatorRequests: async ({ limit = 20 }) => {
      let runtime = curatorRuntime;
      let shouldStop = false;
      if (!runtime) {
        const { startCuratorRuntime } = await import('../curator-runtime.js');
        runtime = await startCuratorRuntime({ databaseName: 'keeris', keerisDb: db });
        shouldStop = true;
      }
      const requests = await runtime.prisma.request.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(Number(limit) || 20, 1), 100),
        include: { responses: true, script: true },
      });
      if (shouldStop) await runtime.stop();
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
      let runtime = curatorRuntime;
      let shouldStop = false;
      if (!runtime) {
        const { startCuratorRuntime } = await import('../curator-runtime.js');
        runtime = await startCuratorRuntime({ databaseName: 'keeris', keerisDb: db });
        shouldStop = true;
      }
      const { createErrRadioPlugin } = await import('../plugins/err-radio.js');

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
      if (shouldStop) await runtime.stop();
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
    updateEpisodeMetadata: async (args) => {
      const { episodeId, url, description, fullText } = args || {};
      let epId = episodeId;
      if (!epId && url) {
        const ep = await db.prepare('SELECT id FROM episodes WHERE url = ? OR url LIKE ? OR cast(id as text) = ?').get(url, `%${url}%`, url);
        if (ep) epId = ep.id;
      }
      if (!epId && url) {
        const match = url.match(/\/(\d+)/);
        if (match) {
          const ep = await db.prepare('SELECT id FROM episodes WHERE id = ? OR url LIKE ?').get(Number(match[1]), `%${match[1]}%`);
          if (ep) epId = ep.id;
        }
      }
      if (!epId) throw new Error('Episode not found');

      const existing = await db.prepare('SELECT id FROM episode_metadata WHERE episode_id = ?').get(epId);
      if (existing) {
        await db.prepare('UPDATE episode_metadata SET description = coalesce(?, description), full_text = coalesce(?, full_text), summary = coalesce(?, summary) WHERE episode_id = ?')
          .run(description ?? null, fullText ?? null, description ? description.slice(0, 500) : null, epId);
      } else {
        await db.prepare('INSERT INTO episode_metadata (episode_id, description, full_text, summary) VALUES (?, ?, ?, ?)')
          .run(epId, description ?? null, fullText ?? null, description ? description.slice(0, 500) : null);
      }

      const meta = await db.prepare('SELECT id, description, full_text AS fullText, summary FROM episode_metadata WHERE episode_id = ?').get(epId);
      return { id: meta.id, description: meta.description, fullText: meta.fullText, summary: meta.summary };
    },
    downloadEpisode: async ({ url, fileName }) => {
      const { createErrRadioPlugin } = await import('../plugins/err-radio.js');
      const plugin = createErrRadioPlugin(db);
      const result = await plugin.tools.vikerraadio_download_episode.runAsync({
        args: { url, fileName },
      });
      return result;
    },
    playlists: async () => {
      const rows = await db.prepare(`SELECT p.id, p.title, p.description, p.created_at AS createdAt, p.updated_at AS updatedAt,
          COUNT(pi.id) AS itemCount
        FROM playlists p
        LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
        GROUP BY p.id, p.title, p.description, p.created_at, p.updated_at
        ORDER BY p.updated_at DESC, p.id DESC`).all();

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
        itemCount: Number(r.itemCount || r.itemcount || 0),
        items: async () => {
          const itemRows = await db.prepare(`SELECT pi.id, pi.playlist_id AS playlistId, pi.position, pi.notes, pi.created_at AS createdAt,
              pi.unique_track_id AS uniqueTrackId, pi.track_id AS trackId, pi.episode_id AS episodeId
            FROM playlist_items pi
            WHERE pi.playlist_id = ?
            ORDER BY pi.position ASC, pi.id ASC`).all(r.id);

          return Promise.all(itemRows.map(async (item) => ({
            id: item.id,
            playlistId: item.playlistId,
            position: item.position,
            notes: item.notes,
            createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
            uniqueTrack: item.uniqueTrackId ? (await db.prepare('SELECT id, fingerprint, artist, title, play_count AS playCount, first_played_at AS firstPlayedAt, last_played_at AS lastPlayedAt FROM unique_tracks WHERE id = ?').get(item.uniqueTrackId)) : null,
            track: item.trackId ? (await db.prepare('SELECT t.id, t.position, t.artist, t.title, t.raw_text AS rawText, e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle FROM tracks t JOIN episodes e ON e.id=t.episode_id LEFT JOIN programs p ON p.id=e.program_id WHERE t.id = ?').get(item.trackId)) : null,
            episode: item.episodeId ? (await db.prepare('SELECT id, url, title, scheduled_at AS scheduledAt, published_at AS publishedAt, parse_status AS parseStatus FROM episodes WHERE id = ?').get(item.episodeId)) : null,
          })));
        }
      }));
    },
    playlist: async ({ id }) => {
      const row = await db.prepare('SELECT id, title, description, created_at AS createdAt, updated_at AS updatedAt FROM playlists WHERE id = ?').get(id);
      if (!row) return null;
      const itemCountRow = await db.prepare('SELECT COUNT(*) AS count FROM playlist_items WHERE playlist_id = ?').get(id);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
        itemCount: Number(itemCountRow?.count || 0),
        items: async () => {
          const itemRows = await db.prepare(`SELECT pi.id, pi.playlist_id AS playlistId, pi.position, pi.notes, pi.created_at AS createdAt,
              pi.unique_track_id AS uniqueTrackId, pi.track_id AS trackId, pi.episode_id AS episodeId
            FROM playlist_items pi
            WHERE pi.playlist_id = ?
            ORDER BY pi.position ASC, pi.id ASC`).all(id);

          return Promise.all(itemRows.map(async (item) => ({
            id: item.id,
            playlistId: item.playlistId,
            position: item.position,
            notes: item.notes,
            createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
            uniqueTrack: item.uniqueTrackId ? (await db.prepare('SELECT id, fingerprint, artist, title, play_count AS playCount, first_played_at AS firstPlayedAt, last_played_at AS lastPlayedAt FROM unique_tracks WHERE id = ?').get(item.uniqueTrackId)) : null,
            track: item.trackId ? (await db.prepare('SELECT t.id, t.position, t.artist, t.title, t.raw_text AS rawText, e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle FROM tracks t JOIN episodes e ON e.id=t.episode_id LEFT JOIN programs p ON p.id=e.program_id WHERE t.id = ?').get(item.trackId)) : null,
            episode: item.episodeId ? (await db.prepare('SELECT id, url, title, scheduled_at AS scheduledAt, published_at AS publishedAt, parse_status AS parseStatus FROM episodes WHERE id = ?').get(item.episodeId)) : null,
          })));
        }
      };
    },
    episodesContainingPlaylist: async ({ playlistId }) => {
      const items = await db.prepare(`SELECT pi.unique_track_id, t.unique_track_id AS resolved_unique_id
        FROM playlist_items pi
        LEFT JOIN tracks t ON t.id = pi.track_id
        WHERE pi.playlist_id = ?`).all(playlistId);

      const uniqueIds = new Set();
      for (const item of items) {
        const uId = item.unique_track_id || item.resolved_unique_id;
        if (uId) uniqueIds.add(uId);
      }

      if (uniqueIds.size === 0) return [];
      const idArray = [...uniqueIds];
      const placeholders = idArray.map(() => '?').join(',');

      const epMatchRows = await db.prepare(`SELECT e.id, COUNT(DISTINCT t.unique_track_id) AS matchedTrackCount,
          COUNT(t.id) AS trackCount, e.title, e.url, e.scheduled_at AS scheduledAt, e.published_at AS publishedAt,
          e.parse_status AS parseStatus, p.id AS programId, p.series_id AS pSeriesId, p.title AS pTitle,
          m.id AS mId, m.description AS mDesc, m.full_text AS mFullText
        FROM episodes e
        JOIN tracks t ON t.episode_id = e.id
        LEFT JOIN programs p ON p.id = e.program_id
        LEFT JOIN episode_metadata m ON m.episode_id = e.id
        WHERE t.unique_track_id IN (${placeholders})
        GROUP BY e.id, p.id, p.series_id, p.title, m.id, m.description, m.full_text
        ORDER BY matchedTrackCount DESC, e.scheduled_at DESC
        LIMIT 50`).all(...idArray);

      const totalPlaylistTracks = idArray.length;

      return epMatchRows.map((row) => {
        const matchedTrackCount = Number(row.matchedTrackCount || row.matchedtrackcount || 1);
        const pct = Math.round((matchedTrackCount / totalPlaylistTracks) * 100);
        return {
          episode: {
            id: row.id,
            url: row.url,
            title: row.title,
            scheduledAt: row.scheduledAt,
            publishedAt: row.publishedAt,
            parseStatus: row.parseStatus,
            trackCount: Number(row.trackCount || row.trackcount || 0),
            program: row.programId ? { id: row.programId, seriesId: row.pseriesid ?? row.pSeriesId, title: row.ptitle ?? row.pTitle } : null,
            metadata: row.mId ? { id: row.mId, description: row.mdesc ?? row.mDesc, fullText: row.mfulltext ?? row.mFullText } : null,
          },
          matchedTrackCount,
          totalPlaylistTracks,
          matchPercentage: pct,
        };
      });
    },
    createPlaylist: async ({ title, description }) => {
      const now = new Date().toISOString();
      const res = await db.prepare('INSERT INTO playlists (title, description, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id')
        .run(title, description ?? null, now, now);
      const newId = res.lastInsertRowid || res.id || (await db.prepare('SELECT id FROM playlists WHERE title = ? ORDER BY id DESC').get(title))?.id;
      const row = await db.prepare('SELECT id, title, description, created_at AS createdAt, updated_at AS updatedAt FROM playlists WHERE id = ?').get(newId);
      return { id: row.id, title: row.title, description: row.description, createdAt: row.createdAt, updatedAt: row.updatedAt, itemCount: 0, items: [] };
    },
    updatePlaylist: async ({ id, title, description }) => {
      const now = new Date().toISOString();
      await db.prepare('UPDATE playlists SET title = coalesce(?, title), description = coalesce(?, description), updated_at = ? WHERE id = ?')
        .run(title ?? null, description ?? null, now, id);
      const row = await db.prepare('SELECT id, title, description, created_at AS createdAt, updated_at AS updatedAt FROM playlists WHERE id = ?').get(id);
      const countRow = await db.prepare('SELECT COUNT(*) AS count FROM playlist_items WHERE playlist_id = ?').get(id);
      return { id: row.id, title: row.title, description: row.description, createdAt: row.createdAt, updatedAt: row.updatedAt, itemCount: Number(countRow?.count || 0), items: [] };
    },
    deletePlaylist: async ({ id }) => {
      await db.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').run(id);
      await db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
      return true;
    },
    addItemToPlaylist: async ({ playlistId, uniqueTrackId, trackId, episodeId, notes }) => {
      const posRow = await db.prepare('SELECT MAX(position) AS maxPos FROM playlist_items WHERE playlist_id = ?').get(playlistId);
      const nextPos = (posRow?.maxPos || 0) + 1;
      const now = new Date().toISOString();
      const res = await db.prepare('INSERT INTO playlist_items (playlist_id, unique_track_id, track_id, episode_id, position, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
        .run(playlistId, uniqueTrackId ? Number(uniqueTrackId) : null, trackId ? Number(trackId) : null, episodeId ? Number(episodeId) : null, nextPos, notes ?? null, now);
      const newId = res.lastInsertRowid || res.id || (await db.prepare('SELECT id FROM playlist_items WHERE playlist_id = ? AND position = ?').get(playlistId, nextPos))?.id;
      await db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, playlistId);

      const item = await db.prepare('SELECT id, playlist_id AS playlistId, position, notes, created_at AS createdAt, unique_track_id AS uniqueTrackId, track_id AS trackId, episode_id AS episodeId FROM playlist_items WHERE id = ?').get(newId);
      return {
        id: item.id,
        playlistId: item.playlistId,
        position: item.position,
        notes: item.notes,
        createdAt: item.createdAt,
        uniqueTrack: item.uniqueTrackId ? (await db.prepare('SELECT id, fingerprint, artist, title, play_count AS playCount, first_played_at AS firstPlayedAt, last_played_at AS lastPlayedAt FROM unique_tracks WHERE id = ?').get(item.uniqueTrackId)) : null,
        track: item.trackId ? (await db.prepare('SELECT t.id, t.position, t.artist, t.title, t.raw_text AS rawText, e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle FROM tracks t JOIN episodes e ON e.id=t.episode_id LEFT JOIN programs p ON p.id=e.program_id WHERE t.id = ?').get(item.trackId)) : null,
        episode: item.episodeId ? (await db.prepare('SELECT id, url, title, scheduled_at AS scheduledAt, published_at AS publishedAt, parse_status AS parseStatus FROM episodes WHERE id = ?').get(item.episodeId)) : null,
      };
    },
    removeItemFromPlaylist: async ({ itemId }) => {
      const item = await db.prepare('SELECT playlist_id FROM playlist_items WHERE id = ?').get(itemId);
      if (item) {
        await db.prepare('DELETE FROM playlist_items WHERE id = ?').run(itemId);
        await db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), item.playlist_id);
      }
      return true;
    },
    reorderPlaylistItems: async ({ playlistId, itemIds }) => {
      const now = new Date().toISOString();
      for (let i = 0; i < itemIds.length; i++) {
        await db.prepare('UPDATE playlist_items SET position = ? WHERE id = ? AND playlist_id = ?').run(i + 1, Number(itemIds[i]), playlistId);
      }
      await db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, playlistId);
      const row = await db.prepare('SELECT id, title, description, created_at AS createdAt, updated_at AS updatedAt FROM playlists WHERE id = ?').get(playlistId);
      return { id: row.id, title: row.title, description: row.description, createdAt: row.createdAt, updatedAt: row.updatedAt, itemCount: itemIds.length, items: [] };
    },
  };
}

export async function executeGraphql(db, source, variables = {}, { curatorRuntime } = {}) {
  return graphql({ schema, source, rootValue: resolvers(db, { curatorRuntime }), variableValues: variables });
}

export { schema, resolvers };