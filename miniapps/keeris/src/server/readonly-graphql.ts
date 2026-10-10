import { buildSchema, graphql, type GraphQLSchema } from 'graphql';
import { readonlyTypeDefs } from '../schema/readonly.ts';

export const readonlySchema: GraphQLSchema = buildSchema(readonlyTypeDefs);

function cleanEpisodeDescription(desc?: string | null, episodeTitle?: string | null, programTitle?: string | null): string | null {
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

export function extractMatchSnippet(text: string | null | undefined, search: string, padding = 65): string | null {
  if (!text || !search) return null;
  const cleanSearch = search.trim();
  if (!cleanSearch) return null;

  const lowerText = text.toLowerCase();
  const lowerSearch = cleanSearch.toLowerCase();
  let idx = lowerText.indexOf(lowerSearch);
  let matchLen = cleanSearch.length;

  if (idx === -1) {
    const nfcText = text.normalize('NFC').toLowerCase();
    const nfcSearch = cleanSearch.normalize('NFC').toLowerCase();
    const nfcIdx = nfcText.indexOf(nfcSearch);
    if (nfcIdx !== -1) {
      idx = Math.min(nfcIdx, text.length - 1);
      matchLen = nfcSearch.length;
    } else {
      const nfdText = text.normalize('NFD').toLowerCase();
      const nfdSearch = cleanSearch.normalize('NFD').toLowerCase();
      const nfdIdx = nfdText.indexOf(nfdSearch);
      if (nfdIdx !== -1) {
        idx = Math.min(nfdIdx, text.length - 1);
        matchLen = nfdSearch.length;
      }
    }
  }
  if (idx === -1) return null;

  let start = Math.max(0, idx - padding);
  let end = Math.min(text.length, idx + matchLen + padding);

  if (start > 0) {
    const space = text.indexOf(' ', start);
    if (space !== -1 && space < idx) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space !== -1 && space > idx + matchLen) end = space;
  }

  let snippet = text.slice(start, end).trim().replace(/\s+/g, ' ');
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

function rowToTrack(row: any) {
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
    episodeId: row.episode_id ?? row.episodeId,
    programId: row.program_id ?? row.programId,
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

function normalizeText(text: unknown): string {
  if (text == null) return '';
  return String(text).normalize('NFC').toLowerCase();
}

export function readonlyResolvers(db: any) {
  try {
    if (typeof db.function === 'function') {
      db.function('norm_text', (text: unknown) => normalizeText(text));
      db.function('lower_utf', (text: unknown) => (text == null ? '' : String(text).toLocaleLowerCase('et-EE')));
    }
  } catch (_) {}

  return {
    programs: async () => {
      const rows = await db.prepare('SELECT id, series_id AS seriesId, title, slug, description, url FROM programs ORDER BY title').all();
      return (rows || []).map((r: any) => ({
        id: r.id,
        seriesId: r.seriesId ?? r.seriesid ?? r.series_id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        url: r.url,
      }));
    },
    program: async ({ id }: { id: string | number }) => {
      const row = await db.prepare('SELECT id, series_id AS seriesId, title, slug, description, url FROM programs WHERE id = ? OR series_id = ?').get(id, String(id));
      if (!row) return null;
      return {
        id: row.id,
        seriesId: row.seriesId ?? row.seriesid ?? row.series_id,
        title: row.title,
        slug: row.slug,
        description: row.description,
        url: row.url,
      };
    },
    episode: async ({ id }: { id: string | number }) => {
      const row = await db.prepare(`SELECT e.*, COUNT(t.id) AS trackCount, p.series_id AS pSeriesId, p.title AS pTitle,
          m.id AS mId, m.description AS mDesc, m.full_text AS mFullText, m.summary AS mSummary
        FROM episodes e
        LEFT JOIN tracks t ON t.episode_id = e.id
        LEFT JOIN programs p ON p.id = e.program_id
        LEFT JOIN episode_metadata m ON m.episode_id = e.id
        WHERE e.id = ?
        GROUP BY e.id, p.series_id, p.title, m.id, m.description, m.full_text, m.summary`).get(id);
      if (!row) return null;
      return {
        id: row.id,
        url: row.url,
        title: row.title,
        scheduledAt: row.scheduled_at,
        publishedAt: row.published_at,
        parseStatus: row.parse_status,
        trackCount: Number(row.trackCount || row.trackcount || 0),
        program: row.program_id ? { id: row.program_id, seriesId: row.pseriesid ?? row.pSeriesId, title: row.ptitle ?? row.pTitle } : null,
        metadata: (row.mid ?? row.mId) ? { id: row.mid ?? row.mId, description: row.mdesc ?? row.mDesc, fullText: row.mfulltext ?? row.mFullText, summary: row.msummary ?? row.mSummary } : null,
      };
    },
    tracks: async ({ search = '', programId, episodeId, limit = 100, offset = 0 }: any) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const cleanSearch = String(search || '').trim();

      const whereClauses: string[] = [];
      const params: any[] = [];

      if (cleanSearch.length > 0) {
        const needle = `%${normalizeText(cleanSearch)}%`;
        whereClauses.push(`(LOWER(coalesce(t.artist, '') || ' ' || coalesce(t.title, '') || ' ' || t.raw_text) LIKE LOWER(?)
           OR LOWER(coalesce(m.description, '') || ' ' || coalesce(m.full_text, '')) LIKE LOWER(?))`);
        params.push(needle, needle);
      }
      if (episodeId) {
        whereClauses.push('t.episode_id = ?');
        params.push(episodeId);
      }
      if (programId) {
        whereClauses.push('e.program_id = ?');
        params.push(programId);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      params.push(safeLimit, safeOffset);

      const rows = await db.prepare(`SELECT t.id, t.position, t.artist, t.title, t.raw_text, t.unique_track_id,
          e.id AS episodeId, p.id AS programId,
          e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle,
          COALESCE(NULLIF(m.description, ''), m.summary) AS episodeDescription,
          ut.artist AS uArtist, ut.title AS uTitle, ut.play_count AS uPlayCount
        FROM tracks t
        JOIN episodes e ON e.id=t.episode_id
        LEFT JOIN programs p ON p.id=e.program_id
        LEFT JOIN unique_tracks ut ON ut.id=t.unique_track_id
        LEFT JOIN episode_metadata m ON m.episode_id=e.id
        ${whereSql}
        ORDER BY e.scheduled_at DESC, t.position LIMIT ? OFFSET ?`).all(...params);
      return rows.map(rowToTrack);
    },
    uniqueTracks: async ({ search = '', programIds = null, limit = 100, offset = 0 }: any) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const cleanSearch = String(search || '').trim();

      const validProgramIds = Array.isArray(programIds)
        ? programIds.map((id) => Number(id)).filter((id) => !isNaN(id) && id > 0)
        : [];

      let progCondition = '';
      let progParams: any[] = [];

      if (validProgramIds.length > 0) {
        const placeholders = validProgramIds.map(() => '?').join(',');
        progCondition = `AND ut.id IN (SELECT DISTINCT t.unique_track_id FROM tracks t JOIN episodes e ON e.id = t.episode_id WHERE e.program_id IN (${placeholders}))`;
        progParams = validProgramIds;
      }

      let trackRows: any[];
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

      const formatted: any[] = trackRows.map((row) => ({
        id: row.id,
        fingerprint: row.fingerprint,
        artist: row.artist,
        title: row.title,
        playCount: row.play_count,
        firstPlayedAt: row.first_played_at,
        lastPlayedAt: row.last_played_at,
        snippet: null as string | null,
        airings: async () => {
          let airProgCond = '';
          let airParams: any[] = [row.id];
          if (validProgramIds.length > 0) {
            const placeholders = validProgramIds.map(() => '?').join(',');
            airProgCond = `AND e.program_id IN (${placeholders})`;
            airParams.push(...validProgramIds);
          }
          const airRows = await db.prepare(`SELECT t.id, t.position, t.artist, t.title, t.raw_text,
              e.id AS episodeId, p.id AS programId,
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
        const needleNfc = `%${cleanSearch.normalize('NFC').toLowerCase()}%`;
        const needleNfd = `%${cleanSearch.normalize('NFD').toLowerCase()}%`;
        const progFilterEp = validProgramIds.length > 0
          ? `AND e.program_id IN (${validProgramIds.map(() => '?').join(',')})`
          : '';
        const epParams = validProgramIds.length > 0
          ? [needleNfc, needleNfd, ...validProgramIds, safeLimit]
          : [needleNfc, needleNfd, safeLimit];

        const epRows = await db.prepare(`SELECT e.id, e.program_id AS programId, e.title AS episodeTitle, e.url AS episodeUrl, e.scheduled_at AS date,
            p.title AS programTitle, COALESCE(NULLIF(m.description, ''), m.summary) AS episodeDescription,
            m.full_text AS episodeFullText, m.description AS rawDescription, m.summary AS rawSummary
          FROM episodes e
          LEFT JOIN programs p ON p.id = e.program_id
          LEFT JOIN episode_metadata m ON m.episode_id = e.id
          WHERE ((LOWER(coalesce(e.title, '') || ' ' || coalesce(m.description, '') || ' ' || coalesce(m.full_text, '')) LIKE LOWER(?))
             OR (LOWER(coalesce(e.title, '') || ' ' || coalesce(m.description, '') || ' ' || coalesce(m.full_text, '')) LIKE LOWER(?)))
            ${progFilterEp}
          ORDER BY e.scheduled_at DESC LIMIT ?`).all(...epParams);

        for (const ep of epRows) {
          const epTitle = ep.episodeTitle ?? ep.episodetitle ?? ep.title ?? 'ERR Saade';
          const epUrl = ep.episodeUrl ?? ep.episodeurl ?? ep.url ?? '';
          const progTitle = ep.programTitle ?? ep.programtitle ?? null;
          const epDesc = ep.episodeDescription ?? ep.episodedescription ?? null;
          const epDate = ep.date ?? ep.scheduled_at ?? null;

          const searchCandidates = [
            ep.episodeFullText ?? ep.episodefulltext,
            ep.rawDescription ?? ep.rawdescription,
            ep.rawSummary ?? ep.rawsummary,
            epDesc,
            epTitle
          ].filter(Boolean);

          let epSnippet: string | null = null;
          for (const cand of searchCandidates) {
            epSnippet = extractMatchSnippet(cand, cleanSearch);
            if (epSnippet) break;
          }

          formatted.push({
            id: `ep-${ep.id}`,
            fingerprint: `ep-${ep.id}`,
            artist: progTitle || 'ERR Arhiiv',
            title: epTitle,
            playCount: 1,
            firstPlayedAt: epDate,
            lastPlayedAt: epDate,
            snippet: epSnippet,
            airings: async () => {
              const epTracks = await db.prepare(`SELECT t.id, t.position, t.artist, t.title, t.raw_text,
                  e.id AS episodeId, p.id AS programId,
                  e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle,
                  COALESCE(NULLIF(m.description, ''), m.summary) AS episodeDescription,
                  ut.artist AS uArtist, ut.title AS uTitle, ut.play_count AS uPlayCount
                FROM tracks t
                JOIN episodes e ON e.id = t.episode_id
                LEFT JOIN programs p ON p.id = e.program_id
                LEFT JOIN unique_tracks ut ON ut.id = t.unique_track_id
                LEFT JOIN episode_metadata m ON m.episode_id = e.id
                WHERE t.episode_id = ? ORDER BY t.position`).all(ep.id);

              if (epTracks.length > 0) {
                const mapped = epTracks.map(rowToTrack);
                const needleLower = cleanSearch.toLowerCase();
                mapped.sort((a: any, b: any) => {
                  const aMatch = (a.artist?.toLowerCase().includes(needleLower) || a.title?.toLowerCase().includes(needleLower) || a.rawText?.toLowerCase().includes(needleLower)) ? 1 : 0;
                  const bMatch = (b.artist?.toLowerCase().includes(needleLower) || b.title?.toLowerCase().includes(needleLower) || b.rawText?.toLowerCase().includes(needleLower)) ? 1 : 0;
                  return bMatch - aMatch;
                });
                return mapped;
              }

              return [{
                id: `ep-air-${ep.id}`,
                position: 1,
                artist: progTitle || 'ERR Arhiiv',
                title: epTitle,
                rawText: epTitle,
                date: epDate,
                episodeId: ep.id,
                programId: ep.programId ?? ep.program_id ?? null,
                episodeTitle: epTitle,
                episodeUrl: epUrl,
                programTitle: progTitle,
                episodeDescription: epSnippet || epDesc,
                uniqueTrack: null,
              }];
            }
          });
        }
      }

      return formatted;
    },
    episodes: async ({ search = '', programId, limit = 100, offset = 0 }: any) => {
      const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const cleanSearch = String(search || '').trim();

      let rows: any[];
      if (cleanSearch.length > 0) {
        const needle = `%${normalizeText(cleanSearch)}%`;
        const filterProgram = programId ? 'AND e.program_id = ?' : '';
        const params = programId ? [needle, needle, programId, safeLimit, safeOffset] : [needle, needle, safeLimit, safeOffset];

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
          LIMIT ? OFFSET ?`).all(...params);
      } else {
        const filterProgram = programId ? 'WHERE e.program_id = ?' : '';
        const params = programId ? [programId, safeLimit, safeOffset] : [safeLimit, safeOffset];

        rows = await db.prepare(`SELECT e.*, COUNT(t.id) AS trackCount, p.series_id AS pSeriesId, p.title AS pTitle,
            m.id AS mId, m.description AS mDesc, m.full_text AS mFullText, m.summary AS mSummary
          FROM episodes e
          LEFT JOIN tracks t ON t.episode_id=e.id
          LEFT JOIN programs p ON p.id=e.program_id
          LEFT JOIN episode_metadata m ON m.episode_id=e.id
          ${filterProgram}
          GROUP BY e.id, p.series_id, p.title, m.id, m.description, m.full_text, m.summary
          ORDER BY e.scheduled_at DESC, e.id DESC
          LIMIT ? OFFSET ?`).all(...params);
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
    stats: async ({ search = '', programIds = null }: any = {}) => {
      const cleanSearch = String(search || '').trim();
      const validProgramIds = Array.isArray(programIds)
        ? programIds.map((id) => Number(id)).filter((id) => !isNaN(id) && id > 0)
        : [];

      if (!cleanSearch && validProgramIds.length === 0) {
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
          programBreakdown: programBreakdown.map((p: any) => ({
            programId: p.programid ?? p.programId,
            programTitle: p.programtitle ?? p.programTitle,
            episodes: Number(p.episodes || 0),
            tracks: Number(p.tracks || 0),
            uniqueTracks: Number(p.uniquetracks ?? p.uniqueTracks ?? 0)
          })),
        };
      }

      // Filtered search totals
      let utWhere: string[] = [];
      let utParams: any[] = [];
      if (cleanSearch) {
        const needle = `%${normalizeText(cleanSearch)}%`;
        utWhere.push("LOWER(coalesce(ut.artist, '') || ' ' || coalesce(ut.title, '')) LIKE LOWER(?)");
        utParams.push(needle);
      }
      if (validProgramIds.length > 0) {
        const ph = validProgramIds.map(() => '?').join(',');
        utWhere.push(`ut.id IN (SELECT DISTINCT t.unique_track_id FROM tracks t JOIN episodes e ON e.id = t.episode_id WHERE e.program_id IN (${ph}))`);
        utParams.push(...validProgramIds);
      }
      const whereClause = utWhere.length > 0 ? ' WHERE ' + utWhere.join(' AND ') : '';

      const utRow = await db.prepare(`SELECT COUNT(*) as utCount, COALESCE(SUM(play_count), 0) as trCount FROM unique_tracks ut ${whereClause}`).get(...utParams);
      const utCount = Number(utRow?.utCount || utRow?.utcount || 0);
      const trCount = Number(utRow?.trCount || utRow?.trcount || 0);

      let epCount = 0;
      if (utCount > 0) {
        let epSql = `SELECT COUNT(DISTINCT t.episode_id) as count FROM tracks t WHERE t.unique_track_id IN (SELECT ut.id FROM unique_tracks ut ${whereClause})`;
        let epParams = [...utParams];
        if (validProgramIds.length > 0) {
          epSql += ` AND t.episode_id IN (SELECT id FROM episodes WHERE program_id IN (${validProgramIds.map(() => '?').join(',')}))`;
          epParams.push(...validProgramIds);
        }
        const epRow = await db.prepare(epSql).get(...epParams);
        epCount = Number(epRow?.count || 0);
      }

      if (cleanSearch) {
        const needle = `%${normalizeText(cleanSearch)}%`;
        let directEpSql = `SELECT COUNT(*) as count FROM episodes e LEFT JOIN episode_metadata m ON m.episode_id = e.id
          WHERE (LOWER(coalesce(e.title, '') || ' ' || coalesce(m.description, '') || ' ' || coalesce(m.full_text, '')) LIKE LOWER(?))`;
        let directEpParams: any[] = [needle];
        if (validProgramIds.length > 0) {
          directEpSql += ` AND e.program_id IN (${validProgramIds.map(() => '?').join(',')})`;
          directEpParams.push(...validProgramIds);
        }
        const directEpRow = await db.prepare(directEpSql).get(...directEpParams);
        const directCount = Number(directEpRow?.count || 0);
        epCount = Math.max(epCount, directCount);
      }

      let prCount = 0;
      if (utCount > 0) {
        let prSql = `SELECT COUNT(DISTINCT e.program_id) as count FROM episodes e JOIN tracks t ON t.episode_id = e.id WHERE t.unique_track_id IN (SELECT ut.id FROM unique_tracks ut ${whereClause})`;
        let prParams = [...utParams];
        if (validProgramIds.length > 0) {
          prSql += ` AND e.program_id IN (${validProgramIds.map(() => '?').join(',')})`;
          prParams.push(...validProgramIds);
        }
        const prRow = await db.prepare(prSql).get(...prParams);
        prCount = Number(prRow?.count || 0);
      }

      return {
        episodes: epCount,
        tracks: trCount,
        uniqueTracks: utCount,
        programs: prCount,
        noTracks: 0,
        oldest: null,
        newest: null,
        programBreakdown: [],
      };
    },
  };
}

export async function executeReadonlyGraphql(
  db: any,
  source: string,
  variables: Record<string, any> = {}
) {
  const rootValue = readonlyResolvers(db);

  return graphql({
    schema: readonlySchema,
    source,
    rootValue,
    variableValues: variables,
  });
}
