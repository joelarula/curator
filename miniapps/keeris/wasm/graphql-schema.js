import { buildSchema, graphql } from 'graphql';
import { PROGRAM_MANIFEST, resolveAgentByTitle } from './wasm-curator-engine.js';
import { typeDefs } from '../src/graphql-typedefs.js';

const schema = buildSchema(typeDefs);

function queryAll(db, sql, params = []) {
  const rows = [];
  db.exec({
    sql,
    bind: params,
    rowMode: 'object',
    resultRows: rows,
  });
  return rows;
}

function queryOne(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function executeSql(db, sql, params = []) {
  db.exec({
    sql,
    bind: params,
  });
}

export async function executeInWorkerGraphql(db, query, variables = {}) {
  const rootValue = {
    programs() {
      return queryAll(db, 'SELECT id, series_id AS seriesId, title, slug, description, url FROM programs ORDER BY id ASC');
    },

    episodes({ search, programId, limit = 100, offset = 0 }) {
      let sql = 'SELECT id, program_id, url, title, scheduled_at AS scheduledAt, published_at AS publishedAt, parse_status AS parseStatus FROM episodes';
      const params = [];
      const where = [];
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
        const prog = ep.program_id ? queryOne(db, 'SELECT id, series_id AS seriesId, title, slug, description, url FROM programs WHERE id = ?', [ep.program_id]) : null;
        const meta = queryOne(db, 'SELECT id, description, full_text AS fullText, summary, keywords FROM episode_metadata WHERE episode_id = ?', [ep.id]);
        return {
          ...ep,
          trackCount: countRes?.count || 0,
          program: prog,
          metadata: meta,
        };
      });
    },

    tracks({ search, programId, episodeId, limit = 100, offset = 0 }) {
      let sql = `
        SELECT t.id, t.position, t.artist, t.title, t.raw_text AS rawText, t.unique_track_id,
               e.title AS episodeTitle, e.url AS episodeUrl, e.scheduled_at AS date,
               p.title AS programTitle
        FROM tracks t
        JOIN episodes e ON t.episode_id = e.id
        LEFT JOIN programs p ON e.program_id = p.id
      `;
      const params = [];
      const where = [];
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
          uniqueTrack = queryOne(db, 'SELECT id, fingerprint, artist, title, play_count AS playCount, first_played_at AS firstPlayedAt, last_played_at AS lastPlayedAt FROM unique_tracks WHERE id = ?', [tr.unique_track_id]);
        }
        return {
          ...tr,
          uniqueTrack,
        };
      });
    },

    uniqueTracks({ search, programIds, limit = 50, offset = 0 }) {
      let sql = 'SELECT id, fingerprint, artist, title, play_count AS playCount, first_played_at AS firstPlayedAt, last_played_at AS lastPlayedAt FROM unique_tracks';
      const params = [];
      const conditions = [];

      if (search) {
        conditions.push('(artist LIKE ? OR title LIKE ? OR fingerprint LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (programIds && programIds.length > 0) {
        const placeholders = programIds.map(() => '?').join(',');
        conditions.push(`id IN (SELECT DISTINCT t.unique_track_id FROM tracks t JOIN episodes e ON t.episode_id = e.id WHERE e.program_id IN (${placeholders}))`);
        params.push(...programIds);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' ORDER BY play_count DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = queryAll(db, sql, params);
      return rows.map((ut) => {
        let airingsSql = `
          SELECT t.id, t.position, e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle, COALESCE(NULLIF(m.description, ''), m.summary) AS episodeDescription
          FROM tracks t
          JOIN episodes e ON t.episode_id = e.id
          LEFT JOIN programs p ON e.program_id = p.id
          LEFT JOIN episode_metadata m ON e.id = m.episode_id
          WHERE t.unique_track_id = ?
        `;
        const airingsParams = [ut.id];
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
    },

    stats() {
      const epCount = queryOne(db, 'SELECT COUNT(*) as count FROM episodes')?.count || 0;
      const trCount = queryOne(db, 'SELECT COUNT(*) as count FROM tracks')?.count || 0;
      const utCount = queryOne(db, 'SELECT COUNT(*) as count FROM unique_tracks')?.count || 0;
      const prCount = queryOne(db, 'SELECT COUNT(*) as count FROM programs')?.count || 0;

      const programs = queryAll(db, 'SELECT id, title FROM programs');
      const programBreakdown = programs.map(p => {
        const pEps = queryOne(db, 'SELECT COUNT(*) as count FROM episodes WHERE program_id = ?', [p.id])?.count || 0;
        const pTracks = queryOne(db, `
          SELECT COUNT(*) as count FROM tracks t
          JOIN episodes e ON t.episode_id = e.id
          WHERE e.program_id = ?
        `, [p.id])?.count || 0;
        const pUnique = queryOne(db, `
          SELECT COUNT(DISTINCT t.unique_track_id) as count FROM tracks t
          JOIN episodes e ON t.episode_id = e.id
          WHERE e.program_id = ? AND t.unique_track_id IS NOT NULL
        `, [p.id])?.count || 0;

        return {
          programId: p.id,
          programTitle: p.title,
          episodes: pEps,
          tracks: pTracks,
          uniqueTracks: pUnique,
        };
      });

      return {
        episodes: epCount,
        tracks: trCount,
        uniqueTracks: utCount,
        programs: prCount,
        programBreakdown,
      };
    },

    curatorAgents() {
      // Merge DB agent rows with manifest to ensure all agents are visible
      const dbRows = queryAll(db, 'SELECT id, name, schedule, is_active FROM agents');
      const dbMap = new Map(dbRows.map(r => [r.id, r]));

      return Object.entries(PROGRAM_MANIFEST).map(([agentName, def]) => {
        const dbRow = dbMap.get(agentName);
        const epRes = queryOne(db, `
          SELECT COUNT(*) as count FROM episodes e
          JOIN programs p ON e.program_id = p.id
          WHERE p.series_id = ?
        `, [String(def.seriesContentId)]);
        const trRes = queryOne(db, `
          SELECT COUNT(*) as count FROM tracks t
          JOIN episodes e ON t.episode_id = e.id
          JOIN programs p ON e.program_id = p.id
          WHERE p.series_id = ?
        `, [String(def.seriesContentId)]);
        const reqRes = queryOne(db, `
          SELECT created_at FROM requests
          WHERE status = 'completed' AND ast LIKE ?
          ORDER BY created_at DESC LIMIT 1
        `, [`%"programTitle":"${def.programTitle}"%`]);
        return {
          id: agentName,
          name: def.programTitle,
          schedule: dbRow?.schedule ?? '0 0 * * *',
          isActive: Boolean(dbRow?.is_active ?? 0),
          episodesCount: epRes?.count || 0,
          tracksCount: trRes?.count || 0,
          lastRunAt: reqRes?.created_at || 'Never',
        };
      });
    },

    toggleCuratorAgent({ id, isActive }) {
      const val = isActive ? 1 : 0;
      executeSql(db, 'UPDATE agents SET is_active = ? WHERE id = ?', [val, id]);
      const r = queryOne(db, 'SELECT id, name, schedule, is_active FROM agents WHERE id = ?', [id]);
      return {
        id: r.id,
        name: r.name,
        schedule: r.schedule,
        isActive: Boolean(r.is_active),
      };
    },

    curatorRequests({ limit = 20 }) {
      const requests = queryAll(db, 'SELECT id, script_id AS scriptId, ast, status, created_at AS createdAt FROM requests ORDER BY created_at DESC LIMIT ?', [limit]);
      return requests.map(req => {
        const responses = queryAll(db, 'SELECT id, request_id AS requestId, content, created_at AS createdAt FROM responses WHERE request_id = ?', [req.id]);
        return {
          ...req,
          responses,
        };
      });
    },

    playlists() {
      const rows = queryAll(db, 'SELECT id, title, description, created_at AS createdAt FROM playlists ORDER BY id DESC');
      return rows.map(pl => {
        const itemCount = queryOne(db, 'SELECT COUNT(*) as count FROM playlist_items WHERE playlist_id = ?', [pl.id])?.count || 0;
        return {
          ...pl,
          itemCount,
          items: [],
        };
      });
    },

    playlist({ id }) {
      const pl = queryOne(db, 'SELECT id, title, description, created_at AS createdAt FROM playlists WHERE id = ?', [id]);
      if (!pl) return null;

      const items = queryAll(db, 'SELECT id, playlist_id AS playlistId, position, notes, created_at AS createdAt, track_id, unique_track_id, episode_id FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC', [id]);
      const mappedItems = items.map(item => {
        let track = null;
        if (item.track_id) {
          track = queryOne(db, 'SELECT id, position, artist, title, raw_text AS rawText FROM tracks WHERE id = ?', [item.track_id]);
        }
        let uniqueTrack = null;
        if (item.unique_track_id) {
          uniqueTrack = queryOne(db, 'SELECT id, fingerprint, artist, title, play_count AS playCount FROM unique_tracks WHERE id = ?', [item.unique_track_id]);
        }
        let episode = null;
        if (item.episode_id) {
          episode = queryOne(db, 'SELECT id, title, url FROM episodes WHERE id = ?', [item.episode_id]);
        }
        return {
          ...item,
          track,
          uniqueTrack,
          episode,
        };
      });

      return {
        ...pl,
        itemCount: mappedItems.length,
        items: mappedItems,
      };
    },

    createPlaylist({ title, description }) {
      executeSql(db, 'INSERT INTO playlists (title, description) VALUES (?, ?)', [title, description ?? null]);
      const created = queryOne(db, 'SELECT id, title, description, created_at AS createdAt FROM playlists ORDER BY id DESC LIMIT 1');
      return {
        ...created,
        itemCount: 0,
        items: [],
      };
    },

    addPlaylistItem({ playlistId, trackId, uniqueTrackId, notes }) {
      const posRes = queryOne(db, 'SELECT COALESCE(MAX(position), 0) + 1 AS nextPos FROM playlist_items WHERE playlist_id = ?', [playlistId]);
      const nextPos = posRes?.nextPos || 1;

      executeSql(db, 'INSERT INTO playlist_items (playlist_id, track_id, unique_track_id, position, notes) VALUES (?, ?, ?, ?, ?)', [
        playlistId,
        trackId ?? null,
        uniqueTrackId ?? null,
        nextPos,
        notes ?? null,
      ]);

      const created = queryOne(db, 'SELECT id, playlist_id AS playlistId, position, notes, created_at AS createdAt FROM playlist_items WHERE playlist_id = ? ORDER BY id DESC LIMIT 1', [playlistId]);
      return created;
    },

    triggerCuratorAgent({ agentName }) {
      // Resolve agent definition from the Curator Engine manifest
      let def = PROGRAM_MANIFEST[agentName];
      if (!def) {
        const resolved = resolveAgentByTitle(agentName);
        if (resolved) def = resolved;
      }

      // Build the canonical agent AST (mirrors createProgramScrapeAST)
      const ast = def
        ? {
            type: 'Sequence',
            name: `scrape_${def.programTitle}`,
            steps: [{
              type: 'ToolTask',
              tool: 'vikerraadio_scrape',
              args: { seriesContentId: String(def.seriesContentId), programTitle: def.programTitle },
            }],
          }
        : { type: 'Sequence', name: agentName, steps: [] };

      const reqId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

      // Ensure FK rows exist
      try {
        executeSql(db, `INSERT OR IGNORE INTO users (id, name, email) VALUES ('1', 'wasm-user', 'wasm@local')`);
        executeSql(db, `INSERT OR IGNORE INTO projects (id, name, user_id) VALUES ('1', 'keeris', '1')`);
        executeSql(db, `INSERT OR IGNORE INTO conversations (id, user_id, project_id) VALUES ('1', '1', '1')`);
      } catch (_) {}

      executeSql(db, `
        INSERT INTO requests (id, user_id, project_id, conversation_id, ast, status)
        VALUES (?, '1', '1', '1', ?, 'pending')
      `, [reqId, JSON.stringify(ast)]);

      return {
        id: reqId,
        scriptId: null,
        ast: JSON.stringify(ast),
        status: 'pending',
        createdAt: new Date().toISOString(),
        responses: [],
      };
    },

    curatorDatabaseHealth() {
      // 1. Dynamic table inspection across all non-system SQLite tables
      const tableRows = queryAll(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC");
      const tables = tableRows.map(r => {
        let count = 0;
        try {
          const res = queryOne(db, `SELECT COUNT(*) AS c FROM "${r.name}"`);
          count = res?.c || 0;
        } catch (_) {}
        return { name: r.name, rowCount: count };
      });

      // 2. Curator AST Engine requests metrics
      let requestsTotal = 0, requestsCompleted = 0, requestsFailed = 0, requestsPending = 0;
      try {
        const reqs = queryAll(db, 'SELECT status, COUNT(*) AS count FROM requests GROUP BY status');
        for (const row of reqs) {
          requestsTotal += row.count;
          if (row.status === 'completed') requestsCompleted += row.count;
          else if (row.status === 'failed') requestsFailed += row.count;
          else if (row.status === 'pending' || row.status === 'running') requestsPending += row.count;
        }
      } catch (_) {}

      // 3. Registered Curator Agents metrics
      let agentsTotal = 0, agentsActive = 0;
      try {
        const agRes = queryAll(db, 'SELECT is_active, COUNT(*) AS count FROM agents GROUP BY is_active');
        for (const row of agRes) {
          agentsTotal += row.count;
          if (row.is_active) agentsActive += row.count;
        }
      } catch (_) {}

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
