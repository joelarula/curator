import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SQLITE_PATH = process.env.SQLITE_PATH || path.resolve(__dirname, '../data/keeris.db');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://curator:curator_secret@localhost:5432/keeris?schema=public';

async function main() {
  console.log('========================================================');
  console.log('   Keeris SQLite -> PostgreSQL Data Migration Pipeline   ');
  console.log('========================================================');
  console.log(`Source SQLite:     ${SQLITE_PATH}`);
  console.log(`Target PostgreSQL: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  if (!existsSync(SQLITE_PATH)) {
    console.error(`Error: Source SQLite database not found at ${SQLITE_PATH}`);
    process.exit(1);
  }

  const sqlite = new DatabaseSync(SQLITE_PATH);
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  const client = await pool.connect();

  try {
    console.log('\n[1/7] Ensuring PostgreSQL extensions & schema...');
    await client.query('CREATE EXTENSION IF NOT EXISTS unaccent;');
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

    await client.query(`
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

      CREATE INDEX IF NOT EXISTS idx_episodes_scheduled_at ON episodes(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_episodes_program_id ON episodes(program_id);
      CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
      CREATE INDEX IF NOT EXISTS idx_tracks_unique_track_id ON tracks(unique_track_id);
      CREATE INDEX IF NOT EXISTS idx_unique_tracks_play_count ON unique_tracks(play_count);
      CREATE INDEX IF NOT EXISTS idx_unique_tracks_artist ON unique_tracks(artist);
    `);

    // 2. Migrate Programs
    console.log('[2/7] Migrating programs...');
    const programs = sqlite.prepare('SELECT * FROM programs').all();
    for (const p of programs) {
      await client.query(`
        INSERT INTO programs (id, series_id, title, slug, description, url, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (series_id) DO UPDATE SET
          title = EXCLUDED.title,
          slug = COALESCE(EXCLUDED.slug, programs.slug),
          description = COALESCE(EXCLUDED.description, programs.description),
          url = COALESCE(EXCLUDED.url, programs.url),
          updated_at = EXCLUDED.updated_at
      `, [p.id, p.series_id, p.title, p.slug, p.description, p.url, p.created_at, p.updated_at]);
    }
    console.log(`  ✓ Transferred ${programs.length} programs`);

    // 3. Migrate Episodes
    console.log('[3/7] Migrating episodes in batches...');
    const episodes = sqlite.prepare('SELECT * FROM episodes ORDER BY id').all();
    const batchSize = 1000;
    for (let i = 0; i < episodes.length; i += batchSize) {
      const chunk = episodes.slice(i, i + batchSize);
      await client.query('BEGIN');
      for (const ep of chunk) {
        await client.query(`
          INSERT INTO episodes (id, program_id, url, title, scheduled_at, published_at, fetched_at, raw_hash, parse_status, parse_error)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            program_id = COALESCE(EXCLUDED.program_id, episodes.program_id),
            url = EXCLUDED.url,
            title = EXCLUDED.title,
            scheduled_at = EXCLUDED.scheduled_at,
            published_at = EXCLUDED.published_at,
            fetched_at = EXCLUDED.fetched_at,
            raw_hash = EXCLUDED.raw_hash,
            parse_status = EXCLUDED.parse_status,
            parse_error = EXCLUDED.parse_error
        `, [ep.id, ep.program_id, ep.url, ep.title, ep.scheduled_at, ep.published_at, ep.fetched_at, ep.raw_hash, ep.parse_status, ep.parse_error]);
      }
      await client.query('COMMIT');
      process.stdout.write(`  ✓ Transferred ${Math.min(i + batchSize, episodes.length)} / ${episodes.length} episodes\r`);
    }
    console.log(`\n  ✓ Transferred all ${episodes.length} episodes`);

    // 4. Migrate Unique Tracks
    console.log('[4/7] Migrating unique_tracks in batches...');
    const uniqueTracks = sqlite.prepare('SELECT * FROM unique_tracks ORDER BY id').all();
    for (let i = 0; i < uniqueTracks.length; i += batchSize) {
      const chunk = uniqueTracks.slice(i, i + batchSize);
      await client.query('BEGIN');
      for (const ut of chunk) {
        await client.query(`
          INSERT INTO unique_tracks (id, fingerprint, artist, title, play_count, first_played_at, last_played_at, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (fingerprint) DO UPDATE SET
            artist = EXCLUDED.artist,
            title = EXCLUDED.title,
            play_count = EXCLUDED.play_count,
            first_played_at = EXCLUDED.first_played_at,
            last_played_at = EXCLUDED.last_played_at,
            updated_at = EXCLUDED.updated_at
        `, [ut.id, ut.fingerprint, ut.artist, ut.title, ut.play_count, ut.first_played_at, ut.last_played_at, ut.created_at, ut.updated_at]);
      }
      await client.query('COMMIT');
      process.stdout.write(`  ✓ Transferred ${Math.min(i + batchSize, uniqueTracks.length)} / ${uniqueTracks.length} unique tracks\r`);
    }
    console.log(`\n  ✓ Transferred all ${uniqueTracks.length} unique tracks`);

    // 5. Migrate Tracks
    console.log('[5/7] Migrating tracks in batches...');
    const tracks = sqlite.prepare('SELECT * FROM tracks ORDER BY id').all();
    for (let i = 0; i < tracks.length; i += batchSize) {
      const chunk = tracks.slice(i, i + batchSize);
      await client.query('BEGIN');
      for (const t of chunk) {
        await client.query(`
          INSERT INTO tracks (id, episode_id, unique_track_id, position, artist, title, raw_text)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (episode_id, position) DO UPDATE SET
            unique_track_id = EXCLUDED.unique_track_id,
            artist = EXCLUDED.artist,
            title = EXCLUDED.title,
            raw_text = EXCLUDED.raw_text
        `, [t.id, t.episode_id, t.unique_track_id, t.position, t.artist, t.title, t.raw_text]);
      }
      await client.query('COMMIT');
      process.stdout.write(`  ✓ Transferred ${Math.min(i + batchSize, tracks.length)} / ${tracks.length} tracks\r`);
    }
    console.log(`\n  ✓ Transferred all ${tracks.length} tracks`);

    // 6. Migrate Episode Metadata
    console.log('[6/7] Migrating episode_metadata in batches...');
    const metadata = sqlite.prepare('SELECT * FROM episode_metadata ORDER BY id').all();
    for (let i = 0; i < metadata.length; i += batchSize) {
      const chunk = metadata.slice(i, i + batchSize);
      await client.query('BEGIN');
      for (const m of chunk) {
        await client.query(`
          INSERT INTO episode_metadata (id, episode_id, description, full_text, summary, keywords)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (episode_id) DO UPDATE SET
            description = EXCLUDED.description,
            full_text = EXCLUDED.full_text,
            summary = EXCLUDED.summary,
            keywords = EXCLUDED.keywords
        `, [m.id, m.episode_id, m.description, m.full_text, m.summary, m.keywords]);
      }
      await client.query('COMMIT');
      process.stdout.write(`  ✓ Transferred ${Math.min(i + batchSize, metadata.length)} / ${metadata.length} metadata rows\r`);
    }
    console.log(`\n  ✓ Transferred all ${metadata.length} metadata rows`);

    // 7. Reset sequences & add Trigram GIN indexes
    console.log('[7/7] Resetting sequences & creating Trigram indexes...');
    await client.query(`
      CREATE OR REPLACE FUNCTION immutable_unaccent(text)
        RETURNS text AS
      $$
      SELECT public.unaccent('public.unaccent', $1)
      $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

      SELECT setval('programs_id_seq', COALESCE((SELECT MAX(id) FROM programs), 1));
      SELECT setval('unique_tracks_id_seq', COALESCE((SELECT MAX(id) FROM unique_tracks), 1));
      SELECT setval('tracks_id_seq', COALESCE((SELECT MAX(id) FROM tracks), 1));
      SELECT setval('episode_metadata_id_seq', COALESCE((SELECT MAX(id) FROM episode_metadata), 1));

      CREATE INDEX IF NOT EXISTS idx_trgm_tracks_artist ON tracks USING gin (immutable_unaccent(lower(artist)) gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_trgm_tracks_title ON tracks USING gin (immutable_unaccent(lower(title)) gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_trgm_unique_tracks_artist ON unique_tracks USING gin (immutable_unaccent(lower(artist)) gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_trgm_unique_tracks_title ON unique_tracks USING gin (immutable_unaccent(lower(title)) gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_trgm_episodes_title ON episodes USING gin (immutable_unaccent(lower(title)) gin_trgm_ops);
    `);

    // Verify Counts
    console.log('\n========================================================');
    console.log('               MIGRATION VERIFICATION                   ');
    console.log('========================================================');
    const pgPrograms = (await client.query('SELECT count(*) FROM programs')).rows[0].count;
    const pgEpisodes = (await client.query('SELECT count(*) FROM episodes')).rows[0].count;
    const pgUniqueTracks = (await client.query('SELECT count(*) FROM unique_tracks')).rows[0].count;
    const pgTracks = (await client.query('SELECT count(*) FROM tracks')).rows[0].count;
    const pgMetadata = (await client.query('SELECT count(*) FROM episode_metadata')).rows[0].count;

    console.log(`Table            | SQLite Count | Postgres Count | Parity`);
    console.log(`--------------------------------------------------------`);
    console.log(`programs         | ${programs.length.toString().padEnd(12)} | ${pgPrograms.toString().padEnd(14)} | ${programs.length == pgPrograms ? '✅ OK' : '❌ MISMATCH'}`);
    console.log(`episodes         | ${episodes.length.toString().padEnd(12)} | ${pgEpisodes.toString().padEnd(14)} | ${episodes.length == pgEpisodes ? '✅ OK' : '❌ MISMATCH'}`);
    console.log(`unique_tracks    | ${uniqueTracks.length.toString().padEnd(12)} | ${pgUniqueTracks.toString().padEnd(14)} | ${uniqueTracks.length == pgUniqueTracks ? '✅ OK' : '❌ MISMATCH'}`);
    console.log(`tracks           | ${tracks.length.toString().padEnd(12)} | ${pgTracks.toString().padEnd(14)} | ${tracks.length == pgTracks ? '✅ OK' : '❌ MISMATCH'}`);
    console.log(`episode_metadata | ${metadata.length.toString().padEnd(12)} | ${pgMetadata.toString().padEnd(14)} | ${metadata.length == pgMetadata ? '✅ OK' : '❌ MISMATCH'}`);
    console.log('========================================================\n');

  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
