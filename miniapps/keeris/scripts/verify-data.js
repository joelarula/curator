import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/keeris-archive-full.db');
console.log('=== ARCHIVE DATABASE VERIFICATION ===');
const totalEp = db.prepare('SELECT COUNT(*) as c FROM episodes').get().c;
const totalTr = db.prepare('SELECT COUNT(*) as c FROM tracks').get().c;
const totalUniq = db.prepare('SELECT COUNT(*) as c FROM unique_tracks').get().c;
console.log(`Total Episodes:      ${totalEp.toLocaleString()}`);
console.log(`Total Track Plays:   ${totalTr.toLocaleString()}`);
console.log(`Total Unique Tracks: ${totalUniq.toLocaleString()}`);

console.log('\n=== PER PROGRAM BREAKDOWN ===');
const rows = db.prepare(`
  SELECT p.title, p.series_id as seriesId, COUNT(DISTINCT e.id) as episodes, COUNT(t.id) as tracks,
         MIN(e.scheduled_at) as earliest, MAX(e.scheduled_at) as latest
  FROM programs p
  LEFT JOIN episodes e ON e.program_id = p.id
  LEFT JOIN tracks t ON t.episode_id = e.id
  GROUP BY p.id
  ORDER BY episodes DESC
`).all();
console.table(rows);

console.log('\n=== 5 REAL RECENT TRACKS FROM ARCHIVE ===');
const sampleTracks = db.prepare(`
  SELECT p.title as program, substr(e.scheduled_at, 1, 10) as aired, t.artist, t.title as song
  FROM tracks t
  JOIN episodes e ON t.episode_id = e.id
  JOIN programs p ON e.program_id = p.id
  WHERE t.artist IS NOT NULL AND t.artist != ''
  ORDER BY e.scheduled_at DESC
  LIMIT 5
`).all();
console.table(sampleTracks);
