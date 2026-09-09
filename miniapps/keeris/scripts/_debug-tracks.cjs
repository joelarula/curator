const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('data/keeris.db', { readOnly: true });
const q = (sql, params = []) => db.prepare(sql).all(...params);

console.log('unique_tracks count:', q('SELECT COUNT(*) c FROM unique_tracks')[0].c);
console.log('episodes with NULL title:', q('SELECT COUNT(*) c FROM episodes WHERE title IS NULL')[0].c);
console.log('episodes with NULL url:', q('SELECT COUNT(*) c FROM episodes WHERE url IS NULL')[0].c);

const rows = q(
  'SELECT id, fingerprint, artist, title, play_count AS playCount, first_played_at AS firstPlayedAt, last_played_at AS lastPlayedAt FROM unique_tracks ORDER BY play_count DESC LIMIT ? OFFSET ?',
  [5, 0]
);
console.log('resolver-style rows:', rows);

for (const ut of rows) {
  const airings = q(
    'SELECT t.id, t.position, e.scheduled_at AS date, e.title AS episodeTitle, e.url AS episodeUrl, p.title AS programTitle FROM tracks t JOIN episodes e ON t.episode_id = e.id LEFT JOIN programs p ON e.program_id = p.id WHERE t.unique_track_id = ? ORDER BY e.id DESC',
    [ut.id]
  );
  console.log('airings for', ut.id, airings.length, airings.slice(0, 2));
}
