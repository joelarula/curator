import { mkdirSync, writeFileSync } from 'node:fs';
import { config, parseDateOption } from './config.js';
import { ErrClient } from './err-client.js';
import { openDatabase } from './db.js';
import { scrape } from './scrape.js';

const args = process.argv.slice(2);
const command = args[0] ?? 'scrape';
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const dbPath = value('db') ?? config.defaultDatabase;

if (command === 'scrape') {
  mkdirSync('data', { recursive: true });
  const db = openDatabase(dbPath);
  const result = await scrape({ client: new ErrClient(), db, from: parseDateOption(value('from')), to: parseDateOption(value('to')), refresh: args.includes('--refresh') });
  console.log(JSON.stringify(result, null, 2));
  db.close();
} else if (command === 'search') {
  const db = openDatabase(dbPath);
  const artist = value('artist') ?? args[1];
  if (!artist) throw new Error('Usage: node src/cli.js search --artist=Keeris');
  const rows = db.prepare(`SELECT e.scheduled_at AS date, e.url, t.position, t.artist, t.title
    FROM tracks t JOIN episodes e ON e.id=t.episode_id
    WHERE lower(t.artist) LIKE lower(?) ORDER BY e.scheduled_at, t.position`).all(`%${artist}%`);
  console.log(JSON.stringify(rows, null, 2));
  db.close();
} else if (command === 'stats') {
  const db = openDatabase(dbPath);
  console.log(JSON.stringify(db.prepare(`SELECT COUNT(*) AS episodes, (SELECT COUNT(*) FROM tracks) AS tracks,
    (SELECT COUNT(*) FROM episodes WHERE parse_status='no_tracks') AS no_tracks,
    MIN(scheduled_at) AS oldest, MAX(scheduled_at) AS newest FROM episodes`).get(), null, 2));
  db.close();
} else if (command === 'export') {
  const db = openDatabase(dbPath);
  const output = value('output') ?? 'data/tracks.csv';
  const rows = db.prepare(`SELECT e.scheduled_at AS date, e.url, t.position, t.artist, t.title, t.raw_text
    FROM tracks t JOIN episodes e ON e.id=t.episode_id ORDER BY e.scheduled_at, t.position`).all();
  const csvValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [['date', 'url', 'position', 'artist', 'title', 'raw_text'], ...rows.map((row) => [row.date, row.url, row.position, row.artist, row.title, row.raw_text])]
    .map((row) => row.map(csvValue).join(',')).join('\n') + '\n';
  mkdirSync('data', { recursive: true });
  writeFileSync(output, csv, 'utf8');
  console.log(JSON.stringify({ output, rows: rows.length }, null, 2));
  db.close();
} else if (command === 'export-json') {
  const output = value('output') ?? 'web/public/tracks.json';
  const db = openDatabase(dbPath);
  const rows = db.prepare(`SELECT t.id, t.position, t.artist, t.title, e.scheduled_at AS date,
    e.title AS episodeTitle, e.url AS episodeUrl, t.raw_text AS rawText
    FROM tracks t JOIN episodes e ON e.id=t.episode_id ORDER BY e.scheduled_at, t.position`).all();
  const data = rows.map((row) => ({
    id: row.id,
    position: row.position,
    artist: row.artist,
    title: row.title,
    date: row.date,
    episodeTitle: row.episodeTitle,
    episodeUrl: row.episodeUrl,
    rawText: row.rawText,
    searchText: [row.artist, row.title, row.rawText].filter(Boolean).join(' ').toLocaleLowerCase(),
  }));
  mkdirSync('web/public', { recursive: true });
  writeFileSync(output, `${JSON.stringify(data)}\n`, 'utf8');
  console.log(JSON.stringify({ output, rows: data.length }, null, 2));
  db.close();
} else {
  throw new Error('Commands: scrape, search, stats, export, export-json');
}