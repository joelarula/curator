import { buildSchema, graphql, type ExecutionResult } from 'graphql';
import { PROGRAM_MANIFEST, resolveAgentByTitle } from './wasm-curator-engine';
import { typeDefs } from '../src/graphql-typedefs';
import type { OpfsDatabase, IGraphqlResult } from './types';

const schema = buildSchema(typeDefs);

function queryAll(db: OpfsDatabase, sql: string, params: any[] = []): any[] {
  const rows: any[] = [];
  db.exec({
    sql,
    bind: params,
    rowMode: 'object',
    resultRows: rows,
  } as any);
  return rows;
}

function queryOne(db: OpfsDatabase, sql: string, params: any[] = []): any {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function executeSql(db: OpfsDatabase, sql: string, params: any[] = []): void {
  db.exec({
    sql,
    bind: params,
  });
}

export async function executeInWorkerGraphql(
  db: OpfsDatabase,
  query: string,
  variables: Record<string, any> = {}
): Promise<ExecutionResult | IGraphqlResult> {
  const rootValue = {
    programs() {
      return queryAll(
        db,
        'SELECT id, series_id AS seriesId, title, slug, description, url FROM programs ORDER BY id ASC'
      );
    },

    episodes({
      search,
      programId,
      limit = 100,
      offset = 0,
    }: {
      search?: string;
      programId?: string;
      limit?: number;
      offset?: number;
    }) {
      let sql =
        'SELECT id, program_id, url, title, scheduled_at AS scheduledAt, published_at AS publishedAt, parse_status AS parseStatus FROM episodes';
      const params: any[] = [];
      const where: string[] = [];
      if (programId) {
        where.push('program_id = ?');
        params.push(programId);
      }
      if (search) {
        where.push('(title LIKE ? OR url LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }
      if (where.length > 0) {
        sql += ' WHERE ' + where.join(' AND ');
      }
      sql += ' ORDER BY scheduled_at DESC, id DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = queryAll(db, sql, params);
      return rows.map((ep) => {
        const countRes = queryOne(db, 'SELECT COUNT(*) as count FROM tracks WHERE episode_id = ?', [ep.id]);
        const prog = ep.program_id
          ? queryOne(
              db,
              'SELECT id, series_id AS seriesId, title, slug, description, url FROM programs WHERE id = ?',
              [ep.program_id]
            )
          : null;
        const meta = queryOne(
          db,
          'SELECT id, description, full_text AS fullText, summary, keywords FROM episode_metadata WHERE episode_id = ?',
          [ep.id]
        );
        return {
          ...ep,
          trackCount: countRes?.count || 0,
          program: prog,
          metadata: meta,
        };
      });
    },

    tracks({
      search,
      programId,
      episodeId,
      limit = 100,
      offset = 0,
    }: {
      search?: string;
      programId?: string;
      episodeId?: string;
      limit?: number;
      offset?: number;
    }) {
      let sql = `
        SELECT t.id, t.position, t.artist, t.title, t.raw_text AS rawText, t.unique_track_id,
               e.title AS episodeTitle, e.url AS episodeUrl, e.scheduled_at AS date,
               p.title AS programTitle
        FROM tracks t
        JOIN episodes e ON t.episode_id = e.id
        LEFT JOIN programs p ON e.program_id = p.id
      `;
      const params: any[] = [];
      const where: string[] = [];
      if (episodeId) {
        where.push('t.episode_id = ?');
        params.push(episodeId);
      }
      if (programId) {
        where.push('e.program_id = ?');
        params.push(programId);
      }
      if (search) {
        where.push('(t.artist LIKE ? OR t.title LIKE ? OR t.raw_text LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (where.length > 0) {
        sql += ' WHERE ' + where.join(' AND ');
      }
      sql += ' ORDER BY t.position ASC, t.id ASC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = queryAll(db, sql, params);
      return rows.map((tr) => {
        let uniqueTrack = null;
        if (tr.unique_track_id) {
          uniqueTrack = queryOne(
            db,
            'SELECT id, fingerprint, artist, title, play_count AS playCount, first_played_at AS firstPlayedAt, last_played_at AS lastPlayedAt FROM unique_tracks WHERE id = ?',
            [tr.unique_track_id]
          );
        }
        return {
          ...tr,
          uniqueTrack,
        };
      });
    },

    uniqueTracks({
      search,
      programIds,
      limit = 50,
      offset = 0,
    }: {
      search?: string;
      programIds?: string[];
      limit?: number;
      offset?: number;
    }) {
      let sql =
        'SELECT id, fingerprint, artist, title, play_count AS playCount, first_played_at AS firstPlayedAt, last_played_at AS lastPlayedAt FROM unique_tracks';
      const params: any[] = [];
      const conditions: string[] = [];

      if (search) {
        conditions.push('(artist LIKE ? OR title LIKE ? OR fingerprint LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (programIds && programIds.length > 0) {
        const placeholders = programIds.map(() => '?').join(',');
        conditions.push(
          `id IN (SELECT DISTINCT t.unique_track_id FROM tracks t JOIN episodes e ON t.episode_id = e.id WHERE e.program_id IN (${placeholders}))`
        );
        params.push(...programIds);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' ORDER BY play_count DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = queryAll(db, sql, params);
      const formatted = rows.map((ut) => {
        let airingsSql = `
          SELECT t.id, t.position, e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle, COALESCE(NULLIF(m.description, ''), m.summary) AS episodeDescription
          FROM tracks t
          JOIN episodes e ON t.episode_id = e.id
          LEFT JOIN programs p ON e.program_id = p.id
          LEFT JOIN episode_metadata m ON e.id = m.episode_id
          WHERE t.unique_track_id = ?
        `;
        const airingsParams: any[] = [ut.id];
        if (programIds && programIds.length > 0) {
          const placeholders = programIds.map(() => '?').join(',');
          airingsSql += ` AND e.program_id IN (${placeholders})`;
          airingsParams.push(...programIds);
        }
        airingsSql += ' ORDER BY e.id DESC';

        const airings = queryAll(db, airingsSql, airingsParams);

        return {
          ...ut,
          airings,
        };
      });

      if (search && search.trim()) {
        const clean = search.trim();
        let epWhere = ['(e.title LIKE ? OR m.description LIKE ? OR m.summary LIKE ?)'];
        let epParams: any[] = [`%${clean}%`, `%${clean}%`, `%${clean}%`];
        if (programIds && programIds.length > 0) {
          const placeholders = programIds.map(() => '?').join(',');
          epWhere.push(`e.program_id IN (${placeholders})`);
          epParams.push(...programIds);
        }
        epParams.push(20);

        const epRows = queryAll(
          db,
          `
          SELECT e.id, e.title AS episodeTitle, e.url AS episodeUrl, e.scheduled_at AS date,
                 p.title AS programTitle, COALESCE(NULLIF(m.description, ''), m.summary) AS episodeDescription
          FROM episodes e
          LEFT JOIN programs p ON p.id = e.program_id
          LEFT JOIN episode_metadata m ON m.episode_id = e.id
          WHERE ${epWhere.join(' AND ')}
          ORDER BY e.scheduled_at DESC LIMIT ?
        `,
          epParams
        );

        for (const ep of epRows) {
          const epTracks = queryAll(
            db,
            `
            SELECT t.id, t.position, t.artist, t.title,
                   e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle,
                   COALESCE(NULLIF(m.description, ''), m.summary) AS episodeDescription
            FROM tracks t
            JOIN episodes e ON e.id = t.episode_id
            LEFT JOIN programs p ON p.id = e.program_id
            LEFT JOIN episode_metadata m ON m.episode_id = e.id
            WHERE t.episode_id = ?
            ORDER BY t.position
          `,
            [ep.id]
          );

          formatted.push({
            id: `ep-${ep.id}`,
            fingerprint: `ep-${ep.id}`,
            artist: ep.programTitle || 'ERR Arhiiv',
            title: ep.episodeTitle,
            playCount: 1,
            firstPlayedAt: ep.date,
            lastPlayedAt: ep.date,
            airings:
              epTracks.length > 0
                ? epTracks
                : [
                    {
                      id: `ep-desc-${ep.id}`,
                      position: 1,
                      date: ep.date,
                      episodeTitle: ep.episodeTitle,
                      episodeUrl: ep.episodeUrl,
                      programTitle: ep.programTitle,
                      episodeDescription: ep.episodeDescription,
                    },
                  ],
          });
        }
      }

      return formatted;
    },

    stats() {
      const epRow = queryOne(db, 'SELECT COUNT(*) as count FROM episodes');
      const trRow = queryOne(db, 'SELECT COUNT(*) as count FROM tracks');
      const utRow = queryOne(db, 'SELECT COUNT(*) as count FROM unique_tracks');
      const prRow = queryOne(db, 'SELECT COUNT(*) as count FROM programs');

      const programBreakdown = queryAll(
        db,
        `
        SELECT p.id as programId, p.title as programTitle,
               COUNT(DISTINCT e.id) as episodes,
               COUNT(t.id) as tracks,
               COUNT(DISTINCT t.unique_track_id) as uniqueTracks
        FROM programs p
        LEFT JOIN episodes e ON e.program_id = p.id
        LEFT JOIN tracks t ON t.episode_id = e.id
        GROUP BY p.id, p.title
      `
      );

      return {
        episodes: epRow?.count || 0,
        tracks: trRow?.count || 0,
        uniqueTracks: utRow?.count || 0,
        programs: prRow?.count || 0,
        programBreakdown,
      };
    },

    playlists() {
      const rows = queryAll(
        db,
        'SELECT id, title, description, created_at AS createdAt FROM playlists ORDER BY id DESC'
      );
      return rows.map((p) => {
        const countRes = queryOne(db, 'SELECT COUNT(*) as count FROM playlist_items WHERE playlist_id = ?', [p.id]);
        return {
          ...p,
          itemCount: countRes?.count || 0,
          items: [],
        };
      });
    },

    playlist({ id }: { id: string }) {
      const p = queryOne(
        db,
        'SELECT id, title, description, created_at AS createdAt FROM playlists WHERE id = ?',
        [id]
      );
      if (!p) return null;
      const countRes = queryOne(db, 'SELECT COUNT(*) as count FROM playlist_items WHERE playlist_id = ?', [p.id]);
      const items = queryAll(
        db,
        'SELECT id, playlist_id AS playlistId, position, notes, created_at AS createdAt, unique_track_id AS uniqueTrackId, track_id AS trackId, episode_id AS episodeId FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC',
        [p.id]
      );
      return {
        ...p,
        itemCount: countRes?.count || 0,
        items,
      };
    },

    createPlaylist({ title, description }: { title: string; description?: string }) {
      executeSql(
        db,
        'INSERT INTO playlists (title, description) VALUES (?, ?)',
        [title, description || null]
      );
      const row = queryOne(
        db,
        'SELECT id, title, description, created_at AS createdAt FROM playlists WHERE title = ? ORDER BY id DESC LIMIT 1',
        [title]
      );
      return {
        ...row,
        itemCount: 0,
        items: [],
      };
    },

    addPlaylistItem({
      playlistId,
      trackId,
      uniqueTrackId,
      notes,
    }: {
      playlistId: string;
      trackId?: string;
      uniqueTrackId?: string;
      notes?: string;
    }) {
      const posRow = queryOne(
        db,
        'SELECT MAX(position) as maxPos FROM playlist_items WHERE playlist_id = ?',
        [playlistId]
      );
      const nextPos = (posRow?.maxPos || 0) + 1;
      executeSql(
        db,
        'INSERT INTO playlist_items (playlist_id, track_id, unique_track_id, position, notes) VALUES (?, ?, ?, ?, ?)',
        [playlistId, trackId || null, uniqueTrackId || null, nextPos, notes || null]
      );
      const row = queryOne(
        db,
        'SELECT id, playlist_id AS playlistId, position, notes, created_at AS createdAt FROM playlist_items WHERE playlist_id = ? AND position = ?',
        [playlistId, nextPos]
      );
      return row;
    },

    curatorAgents() {
      let rows: any[] = [];
      try {
        rows = queryAll(
          db,
          'SELECT id, name, schedule, enabled AS isActive, updatedAt AS lastRunAt FROM "Agent" ORDER BY name ASC'
        );
      } catch (_) {
        try {
          rows = queryAll(
            db,
            'SELECT id, name, schedule, is_active AS isActive, updated_at AS lastRunAt FROM agents ORDER BY name ASC'
          );
        } catch (_) {}
      }

      if (rows.length === 0) {
        rows = Object.entries(PROGRAM_MANIFEST).map(([id, def]) => ({
          id,
          name: def.programTitle,
          schedule: '0 0 * * *',
          isActive: false,
          lastRunAt: 'Never',
        }));
      }

      return rows.map((ag) => {
        let def = PROGRAM_MANIFEST[ag.id];
        if (!def) {
          const resolved = resolveAgentByTitle(ag.name);
          if (resolved) def = resolved;
        }

        let episodesCount = 0;
        let tracksCount = 0;

        if (def) {
          const prog = queryOne(db, 'SELECT id FROM programs WHERE series_id = ?', [String(def.seriesContentId)]);
          if (prog) {
            const epRes = queryOne(db, 'SELECT COUNT(*) as c FROM episodes WHERE program_id = ?', [prog.id]);
            const trRes = queryOne(
              db,
              'SELECT COUNT(t.id) as c FROM tracks t JOIN episodes e ON t.episode_id = e.id WHERE e.program_id = ?',
              [prog.id]
            );
            episodesCount = epRes?.c || 0;
            tracksCount = trRes?.c || 0;
          }
        }

        return {
          ...ag,
          isActive: Boolean(ag.isActive),
          episodesCount,
          tracksCount,
        };
      });
    },

    curatorRequests({ limit = 20 }: { limit?: number } = {}) {
      let rows: any[] = [];
      try {
        rows = queryAll(
          db,
          'SELECT id, ast, status, createdAt FROM "Request" ORDER BY createdAt DESC LIMIT ?',
          [limit]
        );
      } catch (_) {
        try {
          rows = queryAll(
            db,
            'SELECT id, ast, status, created_at AS createdAt FROM requests ORDER BY created_at DESC LIMIT ?',
            [limit]
          );
        } catch (_) {}
      }

      return rows.map((r) => {
        let responses: any[] = [];
        try {
          responses = queryAll(
            db,
            'SELECT id, content, createdAt FROM "Response" WHERE requestId = ? ORDER BY createdAt ASC',
            [r.id]
          );
        } catch (_) {
          try {
            responses = queryAll(
              db,
              'SELECT id, content, created_at AS createdAt FROM responses WHERE request_id = ? ORDER BY created_at ASC',
              [r.id]
            );
          } catch (_) {}
        }
        return {
          ...r,
          responses,
        };
      });
    },

    updateCuratorAgentSchedule({ id, schedule, isActive }: { id: string; schedule?: string; isActive?: boolean }) {
      try {
        const updates: string[] = [];
        const params: any[] = [];
        if (schedule !== undefined) {
          updates.push('schedule = ?');
          params.push(schedule);
        }
        if (isActive !== undefined) {
          updates.push('enabled = ?');
          params.push(isActive ? 1 : 0);
        }
        if (updates.length > 0) {
          params.push(id);
          executeSql(db, `UPDATE "Agent" SET ${updates.join(', ')} WHERE id = ?`, params);
        }
      } catch (_) {
        try {
          const updates: string[] = [];
          const params: any[] = [];
          if (schedule !== undefined) {
            updates.push('schedule = ?');
            params.push(schedule);
          }
          if (isActive !== undefined) {
            updates.push('is_active = ?');
            params.push(isActive ? 1 : 0);
          }
          if (updates.length > 0) {
            params.push(id);
            executeSql(db, `UPDATE agents SET ${updates.join(', ')} WHERE id = ?`, params);
          }
        } catch (_) {}
      }

      return {
        id,
        isActive: Boolean(isActive),
      };
    },

    toggleCuratorAgent({ id, isActive }: { id: string; isActive: boolean }) {
      return this.updateCuratorAgentSchedule({ id, isActive });
    },

    triggerCuratorAgent({ agentName }: { agentName: string }) {
      return {
        id: 'req-' + Date.now(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        responses: [],
      };
    },

    curatorDatabaseHealth() {
      const tableRows = queryAll(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      const tables = tableRows.map((r) => {
        let count = 0;
        try {
          const res = queryOne(db, `SELECT COUNT(*) AS c FROM "${r.name}"`);
          count = res?.c || 0;
        } catch (_) {}
        return { name: r.name, rowCount: count };
      });

      let requestsTotal = 0, requestsCompleted = 0, requestsFailed = 0, requestsPending = 0;
      try {
        const reqs = queryAll(db, 'SELECT status, COUNT(*) AS count FROM "Request" GROUP BY status');
        for (const row of reqs) {
          requestsTotal += row.count;
          if (row.status === 'completed') requestsCompleted += row.count;
          else if (row.status === 'failed') requestsFailed += row.count;
          else if (row.status === 'pending' || row.status === 'running') requestsPending += row.count;
        }
      } catch (_) {
        try {
          const reqs = queryAll(db, 'SELECT status, COUNT(*) AS count FROM requests GROUP BY status');
          for (const row of reqs) {
            requestsTotal += row.count;
            if (row.status === 'completed') requestsCompleted += row.count;
            else if (row.status === 'failed') requestsFailed += row.count;
            else if (row.status === 'pending' || row.status === 'running') requestsPending += row.count;
          }
        } catch (_) {}
      }

      let agentsTotal = 0, agentsActive = 0;
      try {
        const agRes = queryAll(db, 'SELECT enabled, COUNT(*) AS count FROM "Agent" GROUP BY enabled');
        for (const row of agRes) {
          agentsTotal += row.count;
          if (row.enabled) agentsActive += row.count;
        }
      } catch (_) {
        try {
          const agRes = queryAll(db, 'SELECT is_active, COUNT(*) AS count FROM agents GROUP BY is_active');
          for (const row of agRes) {
            agentsTotal += row.count;
            if (row.is_active) agentsActive += row.count;
          }
        } catch (_) {}
      }

      return {
        storageEngine: 'SQLite3 WASM (OPFS)',
        isOpfs: true,
        tables,
        requestsTotal,
        requestsCompleted,
        requestsFailed,
        requestsPending,
        agentsTotal,
        agentsActive,
      };
    },
  };

  return graphql({
    schema,
    source: query,
    rootValue,
    variableValues: variables,
  });
}

/**
 * Creates executable GraphQL resolvers compatible with CuratorWasmCore (customResolvers).
 */
export function createExecutableResolvers(db: OpfsDatabase) {
  return {
    Query: {
      programs: () => queryAll(db, 'SELECT id, series_id AS seriesId, title, slug, description, url FROM programs ORDER BY id ASC'),
      episodes: (_: any, args: any) => (executeInWorkerGraphql(db, 'query', {}) as any),
    },
  };
}
