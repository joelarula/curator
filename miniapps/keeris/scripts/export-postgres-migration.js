import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../dist-migration');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function escapeSqlValue(val, type) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    if (val instanceof Date) return `'${val.toISOString()}'`;
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function exportKeeris(sourceUrl, dbPrefix = '') {
  console.log('\n--- Exporting KEERIS database ---');
  const client = new pg.Client(sourceUrl);
  await client.connect();

  const targetDbName = dbPrefix ? `${dbPrefix}keeris` : 'keeris';
  const sqlFile = path.join(OUT_DIR, 'keeris_migration.sql');
  const writeStream = fs.createWriteStream(sqlFile, { encoding: 'utf-8' });

  writeStream.write(`-- Keeris Database Migration Script\n`);
  writeStream.write(`-- Target: ${targetDbName}\n`);
  writeStream.write(`-- Generated: ${new Date().toISOString()}\n\n`);

  writeStream.write(`SET client_encoding = 'UTF8';\n`);
  writeStream.write(`SET standard_conforming_strings = on;\n`);
  writeStream.write(`SET check_function_bodies = false;\n\n`);

  writeStream.write(`CREATE EXTENSION IF NOT EXISTS unaccent;\n`);
  writeStream.write(`CREATE EXTENSION IF NOT EXISTS pg_trgm;\n\n`);

  // DDL
  writeStream.write(`-- Table Schemas\n`);
  writeStream.write(`
CREATE TABLE IF NOT EXISTS programs (
  id SERIAL PRIMARY KEY,
  series_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY,
  program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
  url TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  scheduled_at TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  raw_hash TEXT,
  parse_status TEXT DEFAULT 'pending',
  parse_error TEXT
);

CREATE TABLE IF NOT EXISTS unique_tracks (
  id SERIAL PRIMARY KEY,
  fingerprint TEXT UNIQUE NOT NULL,
  artist TEXT,
  title TEXT,
  play_count INTEGER DEFAULT 1,
  first_played_at TEXT,
  last_played_at TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tracks (
  id SERIAL PRIMARY KEY,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  unique_track_id INTEGER REFERENCES unique_tracks(id) ON DELETE SET NULL,
  position INTEGER NOT NULL,
  artist TEXT,
  title TEXT,
  raw_text TEXT NOT NULL,
  UNIQUE(episode_id, position)
);

CREATE TABLE IF NOT EXISTS episode_metadata (
  id SERIAL PRIMARY KEY,
  episode_id INTEGER UNIQUE NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  description TEXT,
  full_text TEXT,
  summary TEXT,
  keywords TEXT
);

CREATE TABLE IF NOT EXISTS playlists (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id SERIAL PRIMARY KEY,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  unique_track_id INTEGER REFERENCES unique_tracks(id) ON DELETE SET NULL,
  track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
  position INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodes_scheduled_at ON episodes(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_episodes_program_id ON episodes(program_id);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
CREATE INDEX IF NOT EXISTS idx_tracks_unique_track_id ON tracks(unique_track_id);
CREATE INDEX IF NOT EXISTS idx_unique_tracks_play_count ON unique_tracks(play_count);
CREATE INDEX IF NOT EXISTS idx_unique_tracks_artist ON unique_tracks(artist);
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_position ON playlist_items(playlist_id, position);
\n`);

  const tables = ['programs', 'episodes', 'unique_tracks', 'tracks', 'episode_metadata', 'playlists', 'playlist_items'];

  for (const table of tables) {
    const countRes = await client.query(`SELECT count(*) FROM "${table}"`);
    const total = parseInt(countRes.rows[0].count, 10);
    console.log(`  Streaming ${table} (${total.toLocaleString()} rows)...`);

    writeStream.write(`\n-- Data for ${table} (${total} rows)\n`);
    if (total === 0) continue;

    const batchSize = 1000;
    let offset = 0;

    // Get column names in order
    const colsRes = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1 
      ORDER BY ordinal_position
    `, [table]);
    const cols = colsRes.rows.map(r => `"${r.column_name}"`).join(', ');
    const rawCols = colsRes.rows.map(r => r.column_name);

    while (offset < total) {
      const rowsRes = await client.query(`SELECT * FROM "${table}" ORDER BY 1 LIMIT $1 OFFSET $2`, [batchSize, offset]);
      if (rowsRes.rows.length === 0) break;

      const valuesChunks = rowsRes.rows.map(row => {
        const vals = rawCols.map(c => escapeSqlValue(row[c]));
        return `(${vals.join(', ')})`;
      });

      writeStream.write(`INSERT INTO "${table}" (${cols}) VALUES\n  ${valuesChunks.join(',\n  ')}\nON CONFLICT DO NOTHING;\n`);
      offset += rowsRes.rows.length;
      process.stdout.write(`    Transferred ${Math.min(offset, total)} / ${total} rows\r`);
    }
    console.log(`    ✓ Exported ${total.toLocaleString()} rows from ${table}`);
  }

  // Sequences and Trigram Indexes
  writeStream.write(`\n-- Reset Sequences\n`);
  writeStream.write(`SELECT setval('programs_id_seq', COALESCE((SELECT MAX(id) FROM programs), 1));\n`);
  writeStream.write(`SELECT setval('unique_tracks_id_seq', COALESCE((SELECT MAX(id) FROM unique_tracks), 1));\n`);
  writeStream.write(`SELECT setval('tracks_id_seq', COALESCE((SELECT MAX(id) FROM tracks), 1));\n`);
  writeStream.write(`SELECT setval('episode_metadata_id_seq', COALESCE((SELECT MAX(id) FROM episode_metadata), 1));\n`);
  writeStream.write(`SELECT setval('playlists_id_seq', COALESCE((SELECT MAX(id) FROM playlists), 1));\n`);
  writeStream.write(`SELECT setval('playlist_items_id_seq', COALESCE((SELECT MAX(id) FROM playlist_items), 1));\n\n`);

  writeStream.write(`-- Trigram and Unaccent Search Indexes\n`);
  writeStream.write(`
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text AS
$$
SELECT public.unaccent('public.unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

CREATE INDEX IF NOT EXISTS idx_trgm_tracks_artist ON tracks USING gin (immutable_unaccent(lower(artist)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_tracks_title ON tracks USING gin (immutable_unaccent(lower(title)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_unique_tracks_artist ON unique_tracks USING gin (immutable_unaccent(lower(artist)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_unique_tracks_title ON unique_tracks USING gin (immutable_unaccent(lower(title)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_trgm_episodes_title ON episodes USING gin (immutable_unaccent(lower(title)) gin_trgm_ops);
\n`);

  await new Promise(res => writeStream.end(res));
  await client.end();
  console.log(`✓ Finished Keeris export -> ${sqlFile}`);
}

async function exportCurator(sourceUrl, dbPrefix = '') {
  console.log('\n--- Exporting CURATOR database ---');
  const client = new pg.Client(sourceUrl);
  await client.connect();

  const targetDbName = dbPrefix ? `${dbPrefix}curator` : 'curator';
  const sqlFile = path.join(OUT_DIR, 'curator_migration.sql');
  const writeStream = fs.createWriteStream(sqlFile, { encoding: 'utf-8' });

  writeStream.write(`-- Curator Studio Database Migration Script\n`);
  writeStream.write(`-- Target: ${targetDbName}\n`);
  writeStream.write(`-- Generated: ${new Date().toISOString()}\n\n`);

  writeStream.write(`SET client_encoding = 'UTF8';\n`);
  writeStream.write(`SET standard_conforming_strings = on;\n\n`);

  // Enums
  writeStream.write(`DO $$ BEGIN\n`);
  writeStream.write(`  CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'WAITING', 'PAUSED', 'COMPLETED', 'FAILED');\n`);
  writeStream.write(`EXCEPTION WHEN duplicate_object THEN null; END $$;\n\n`);

  // Tables list
  const tablesRes = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  // Dump Table DDLs
  console.log(`  Inspecting ${tablesRes.rows.length} tables in curator...`);
  
  // Disable FK constraints during load
  writeStream.write(`SET session_replication_role = 'replica';\n\n`);

  // DDL definitions for curator tables
  const ddlPath = path.resolve(__dirname, '../../server/prisma/migrations/20260508194406_init/migration.sql');
  if (fs.existsSync(ddlPath)) {
    const rawMigration = fs.readFileSync(ddlPath, 'utf-8');
    // Remove vector extension if remote server doesn't have pgvector installed
    const sanitizedDdl = rawMigration
      .replace(/CREATE EXTENSION IF NOT EXISTS "vector";/g, '-- CREATE EXTENSION IF NOT EXISTS "vector";')
      .replace(/CREATE TYPE "RequestStatus"[^;]+;/g, '');
    writeStream.write(`-- Schema DDL from Prisma\n${sanitizedDdl}\n\n`);
  }

  // Dump rows for each table
  for (const row of tablesRes.rows) {
    const table = row.table_name;
    const countRes = await client.query(`SELECT count(*) FROM "${table}"`);
    const total = parseInt(countRes.rows[0].count, 10);
    if (total === 0) continue;

    console.log(`  Exporting ${table} (${total} rows)...`);
    writeStream.write(`\n-- Data for ${table} (${total} rows)\n`);

    const colsRes = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1 
      ORDER BY ordinal_position
    `, [table]);
    const cols = colsRes.rows.map(r => `"${r.column_name}"`).join(', ');
    const rawCols = colsRes.rows.map(r => r.column_name);

    const rowsRes = await client.query(`SELECT * FROM "${table}"`);
    const valuesChunks = rowsRes.rows.map(r => {
      const vals = rawCols.map(c => escapeSqlValue(r[c]));
      return `(${vals.join(', ')})`;
    });

    writeStream.write(`INSERT INTO "${table}" (${cols}) VALUES\n  ${valuesChunks.join(',\n  ')}\nON CONFLICT DO NOTHING;\n`);
    console.log(`    ✓ Exported ${total} rows from ${table}`);
  }

  writeStream.write(`\nSET session_replication_role = 'origin';\n`);

  await new Promise(res => writeStream.end(res));
  await client.end();
  console.log(`✓ Finished Curator export -> ${sqlFile}`);
}

async function main() {
  const curatorSource = process.env.CURATOR_SOURCE || 'postgresql://curator:curator_secret@192.168.1.110:5432/curator';
  const keerisSource = process.env.KEERIS_SOURCE || 'postgresql://curator:curator_secret@192.168.1.110:5432/keeris';
  const prefix = process.env.DB_PREFIX || 'sepisedc_';

  console.log('========================================================');
  console.log('  Exporting PostgreSQL Databases for Remote Migration   ');
  console.log('========================================================');
  console.log(`Source Curator: ${curatorSource.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Source Keeris:  ${keerisSource.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Target Prefix:  ${prefix}`);
  console.log(`Output Folder:  ${OUT_DIR}`);

  await exportKeeris(keerisSource, prefix);
  await exportCurator(curatorSource, prefix);

  // Generate lightweight PHP 1-click import runner
  const phpRunner = `<?php
/**
 * Self-contained 1-Click PostgreSQL Database Importer for Virtuaal / cPanel
 * Place this file in public_html and run via browser: https://sepised.com/import.php?key=curator2026
 */
$SECRET_KEY = 'curator2026';
if (!isset($_GET['key']) || $_GET['key'] !== $SECRET_KEY) {
    die('Forbidden: Missing or invalid secret key.');
}

header('Content-Type: text/plain; charset=utf-8');
echo "=== PostgreSQL Import Runner (Host: 127.0.0.200) ===\\n\\n";

$host = '127.0.0.200';
$port = '5432';
$user = 'sepisedc';
$password = isset($_POST['password']) ? $_POST['password'] : (isset($_GET['password']) ? $_GET['password'] : '');

if (empty($password)) {
    echo "Usage: Supply password via ?password=YOUR_PASSWORD or POST parameter\\n";
    exit(1);
}

function runSqlFile($dbName, $filePath, $host, $port, $user, $password) {
    echo "Importing to database: $dbName from $filePath...\\n";
    if (!file_exists($filePath)) {
        echo "Error: File $filePath does not exist!\\n";
        return;
    }

    $connStr = "host=$host port=$port dbname=$dbName user=$user password=$password";
    $db = @pg_connect($connStr);
    if (!$db) {
        echo "Failed to connect to $dbName: " . pg_last_error() . "\\n";
        return;
    }
    echo "Connected successfully to $dbName!\\n";

    $sql = file_get_contents($filePath);
    $res = pg_query($db, $sql);
    if ($res) {
        echo "✓ Successfully executed $filePath!\\n";
    } else {
        echo "Error executing queries: " . pg_last_error($db) . "\\n";
    }

    // Check table counts
    $tRes = pg_query($db, "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
    echo "Tables in $dbName:\\n";
    while ($row = pg_fetch_assoc($tRes)) {
        $tbl = $row['table_name'];
        $cRes = pg_query($db, "SELECT count(*) FROM \\"$tbl\\"");
        $cnt = pg_fetch_result($cRes, 0, 0);
        echo "  - $tbl : $cnt rows\\n";
    }
    pg_close($db);
    echo "\\n";
}

$keerisDb = '${prefix}keeris';
$curatorDb = '${prefix}curator';

runSqlFile($keerisDb, __DIR__ . '/keeris_migration.sql', $host, $port, $user, $password);
runSqlFile($curatorDb, __DIR__ . '/curator_migration.sql', $host, $port, $user, $password);

echo "=== Migration Complete! Please delete import.php now for security. ===\\n";
?>`;

  fs.writeFileSync(path.join(OUT_DIR, 'import.php'), phpRunner, 'utf-8');
  console.log(`✓ Generated 1-Click PHP importer -> ${path.join(OUT_DIR, 'import.php')}`);

  console.log('\n========================================================');
  console.log('✓ Migration Package Ready in: miniapps/keeris/dist-migration/');
  console.log('========================================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
