import { computeTrackFingerprint, parseMusicEntry } from './text-parser.js';

let isRunning = false;
let timerId = null;

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

function executeSql(db, sql, params = []) {
  db.exec({
    sql,
    bind: params,
  });
}

export function startInWorkerCuratorRunner(db, intervalMs = 2000) {
  if (isRunning) return;
  isRunning = true;

  console.log('[Curator Wasm Engine] Started background RequestProcessor loop');

  async function processPendingRequests() {
    if (!isRunning) return;
    try {
      const pending = queryAll(db, "SELECT id, ast, context FROM requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5");
      for (const req of pending) {
        console.log(`[Curator Wasm Engine] Executing AST Request ID: ${req.id}`);
        let ast = {};
        try {
          ast = JSON.parse(req.ast);
        } catch (_) {}

        let logOutput = `[Wasm Engine] Execution started for Request ${req.id}\n`;

        // Run AST indexing workflow
        const tracks = queryAll(db, 'SELECT id, artist, title, raw_text FROM tracks WHERE unique_track_id IS NULL LIMIT 200');
        let indexedCount = 0;

        for (const tr of tracks) {
          let artist = tr.artist;
          let title = tr.title;
          if (!artist || !title) {
            const parsed = parseMusicEntry(tr.raw_text);
            artist = artist || parsed.artist;
            title = title || parsed.title;
          }

          const fp = computeTrackFingerprint(artist, title, tr.raw_text);
          if (fp) {
            const existingUt = queryAll(db, 'SELECT id, play_count FROM unique_tracks WHERE fingerprint = ?', [fp]);
            let utId;
            if (existingUt.length > 0) {
              utId = existingUt[0].id;
              executeSql(db, 'UPDATE unique_tracks SET play_count = play_count + 1, last_played_at = CURRENT_TIMESTAMP WHERE id = ?', [utId]);
            } else {
              executeSql(db, 'INSERT INTO unique_tracks (fingerprint, artist, title, play_count) VALUES (?, ?, ?, 1)', [fp, artist ?? '', title ?? '']);
              const newUt = queryAll(db, 'SELECT id FROM unique_tracks WHERE fingerprint = ?', [fp]);
              utId = newUt[0]?.id;
            }
            if (utId) {
              executeSql(db, 'UPDATE tracks SET unique_track_id = ?, artist = COALESCE(artist, ?), title = COALESCE(title, ?) WHERE id = ?', [utId, artist ?? '', title ?? '', tr.id]);
              indexedCount++;
            }
          }
        }

        logOutput += `[Wasm Engine] Indexed ${indexedCount} unique played tracks in OPFS SQLite.\nCompleted successfully.`;

        const respId = `resp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        executeSql(db, 'INSERT INTO responses (id, request_id, content) VALUES (?, ?, ?)', [respId, req.id, logOutput]);
        executeSql(db, "UPDATE requests SET status = 'completed' WHERE id = ?", [req.id]);
      }
    } catch (err) {
      console.error('[Curator Wasm Engine] AST processor error:', err);
    } finally {
      if (isRunning) {
        timerId = setTimeout(processPendingRequests, intervalMs);
      }
    }
  }

  processPendingRequests();

  return {
    stop() {
      isRunning = false;
      if (timerId) clearTimeout(timerId);
      console.log('[Curator Wasm Engine] Stopped RequestProcessor loop');
    },
  };
}
