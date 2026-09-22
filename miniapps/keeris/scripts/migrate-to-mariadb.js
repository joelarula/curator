import pg from 'pg';
import mysql from '../../../server/node_modules/mysql2/promise.js';

const PG_KEERIS_URL = process.env.PG_KEERIS_URL || 'postgresql://curator:curator_secret@192.168.1.110:5432/keeris';
const PG_CURATOR_URL = process.env.PG_CURATOR_URL || 'postgresql://curator:curator_secret@192.168.1.110:5432/curator';

const MARIADB_CONFIG = {
  host: process.env.MARIADB_HOST || '185.169.68.23',
  port: Number(process.env.MARIADB_PORT || 3306),
  user: process.env.MARIADB_USER || 'sepisedc_curator_keeris_admin',
  password: process.env.MARIADB_PASSWORD || ',ijI]EQ-z6=H6aem',
  database: process.env.MARIADB_DATABASE || 'sepisedc_curator_keeris',
  connectTimeout: 15000,
};

async function main() {
  console.log('================================================================');
  console.log('   PostgreSQL -> Remote MariaDB 11.4 Live Migration Pipeline    ');
  console.log('================================================================');
  console.log(`Source Keeris:  ${PG_KEERIS_URL.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Source Curator: ${PG_CURATOR_URL.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`Target MariaDB: ${MARIADB_CONFIG.user}@${MARIADB_CONFIG.host}:${MARIADB_CONFIG.port}/${MARIADB_CONFIG.database}\n`);

  console.log('[1/4] Connecting to target MariaDB...');
  const maria = await mysql.createConnection(MARIADB_CONFIG);
  console.log('  ✓ Connected to MariaDB!');

  // Temporarily disable foreign keys for blazing fast bulk insert
  await maria.query('SET FOREIGN_KEY_CHECKS = 0;');
  await maria.query('SET sql_mode = "NO_AUTO_VALUE_ON_ZERO";');

  // Step 2: Create Keeris Schemas
  console.log('\n[2/4] Creating Keeris tables & schemas in MariaDB...');
  await maria.query(`
    CREATE TABLE IF NOT EXISTS programs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      series_id VARCHAR(255) NOT NULL UNIQUE,
      title VARCHAR(500) NOT NULL,
      slug VARCHAR(255) UNIQUE,
      description TEXT,
      url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await maria.query(`
    CREATE TABLE IF NOT EXISTS episodes (
      id INT PRIMARY KEY,
      program_id INT,
      url VARCHAR(500) NOT NULL UNIQUE,
      title VARCHAR(500) NOT NULL,
      scheduled_at VARCHAR(100),
      published_at VARCHAR(100),
      fetched_at VARCHAR(100) NOT NULL,
      raw_hash VARCHAR(100),
      parse_status VARCHAR(50) DEFAULT 'pending',
      parse_error TEXT,
      INDEX idx_episodes_scheduled_at (scheduled_at),
      INDEX idx_episodes_program_id (program_id),
      CONSTRAINT fk_episodes_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await maria.query(`
    CREATE TABLE IF NOT EXISTS unique_tracks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fingerprint VARCHAR(500) NOT NULL UNIQUE,
      artist VARCHAR(500),
      title VARCHAR(500),
      play_count INT DEFAULT 1,
      first_played_at VARCHAR(100),
      last_played_at VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_unique_tracks_play_count (play_count),
      INDEX idx_unique_tracks_artist (artist)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await maria.query(`
    CREATE TABLE IF NOT EXISTS tracks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      episode_id INT NOT NULL,
      unique_track_id INT,
      position INT NOT NULL,
      artist VARCHAR(500),
      title VARCHAR(500),
      raw_text TEXT NOT NULL,
      UNIQUE KEY uq_tracks_ep_pos (episode_id, position),
      INDEX idx_tracks_artist (artist),
      INDEX idx_tracks_unique_track_id (unique_track_id),
      CONSTRAINT fk_tracks_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
      CONSTRAINT fk_tracks_unique_track FOREIGN KEY (unique_track_id) REFERENCES unique_tracks(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await maria.query(`
    CREATE TABLE IF NOT EXISTS episode_metadata (
      id INT AUTO_INCREMENT PRIMARY KEY,
      episode_id INT NOT NULL UNIQUE,
      description MEDIUMTEXT,
      full_text LONGTEXT,
      summary MEDIUMTEXT,
      keywords TEXT,
      CONSTRAINT fk_meta_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await maria.query(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await maria.query(`
    CREATE TABLE IF NOT EXISTS playlist_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      playlist_id INT NOT NULL,
      unique_track_id INT,
      track_id INT,
      episode_id INT,
      position INT DEFAULT 1,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_playlist_items_pos (playlist_id, position),
      CONSTRAINT fk_items_playlist FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      CONSTRAINT fk_items_unique_track FOREIGN KEY (unique_track_id) REFERENCES unique_tracks(id) ON DELETE SET NULL,
      CONSTRAINT fk_items_track FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE SET NULL,
      CONSTRAINT fk_items_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  ✓ Keeris MariaDB tables created.');

  // Step 3: Migrate Keeris Data
  console.log('\n[3/4] Migrating Keeris data (189,218 rows)...');
  const pgKeeris = new pg.Pool({ connectionString: PG_KEERIS_URL });

  const keerisTables = [
    'programs',
    'episodes',
    'unique_tracks',
    'tracks',
    'episode_metadata',
    'playlists',
    'playlist_items'
  ];

  const parityReport = [];

  for (const table of keerisTables) {
    const countRes = await pgKeeris.query(`SELECT count(*) FROM "${table}"`);
    const pgCount = parseInt(countRes.rows[0].count, 10);

    if (pgCount === 0) {
      parityReport.push({ table, source: 0, target: 0, status: '✅ OK' });
      continue;
    }

    const colsRes = await pgKeeris.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1 
      ORDER BY ordinal_position
    `, [table]);
    const rawCols = colsRes.rows.map(r => r.column_name);
    const colSql = rawCols.map(c => `\`${c}\``).join(', ');
    const placeholder = `(${rawCols.map(() => '?').join(', ')})`;

    const batchSize = 1000;
    let offset = 0;
    const startTime = Date.now();

    while (offset < pgCount) {
      const rowsRes = await pgKeeris.query(`SELECT * FROM "${table}" ORDER BY 1 LIMIT $1 OFFSET $2`, [batchSize, offset]);
      if (rowsRes.rows.length === 0) break;

      const flatParams = [];
      const rowPlaceholders = [];

      for (const row of rowsRes.rows) {
        rowPlaceholders.push(placeholder);
        for (const col of rawCols) {
          let val = row[col];
          if (val instanceof Date) {
            val = val.toISOString().slice(0, 19).replace('T', ' ');
          } else if (typeof val === 'object' && val !== null) {
            val = JSON.stringify(val);
          }
          flatParams.push(val);
        }
      }

      const insertSql = `INSERT IGNORE INTO \`${table}\` (${colSql}) VALUES ${rowPlaceholders.join(', ')}`;
      await maria.query(insertSql, flatParams);

      offset += rowsRes.rows.length;
      const pct = Math.round((offset / pgCount) * 100);
      process.stdout.write(`  -> ${table.padEnd(18)} : ${offset.toLocaleString()} / ${pgCount.toLocaleString()} (${pct}%)\r`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const [mCountRows] = await maria.query(`SELECT count(*) as count FROM \`${table}\``);
    const mariaCount = mCountRows[0].count;
    console.log(`  ✓ ${table.padEnd(18)} : ${mariaCount.toLocaleString()} rows in ${duration}s           `);

    parityReport.push({
      table,
      source: pgCount,
      target: mariaCount,
      status: pgCount === mariaCount ? '✅ OK' : '❌ MISMATCH'
    });
  }

  // Step 4: Curator Core Data (Tool, etc.)
  console.log('\n[4/4] Migrating Curator tools & registry...');
  const pgCurator = new pg.Pool({ connectionString: PG_CURATOR_URL });
  
  await maria.query(`
    CREATE TABLE IF NOT EXISTS Tool (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(191) NOT NULL UNIQUE,
      description TEXT,
      version VARCHAR(50),
      accessLevel VARCHAR(50) DEFAULT 'safe_write',
      requiresConfirmation BOOLEAN DEFAULT FALSE,
      enabled BOOLEAN DEFAULT TRUE,
      existent BOOLEAN DEFAULT TRUE,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const toolsRes = await pgCurator.query('SELECT * FROM "Tool"');
  if (toolsRes.rows.length > 0) {
    for (const tool of toolsRes.rows) {
      await maria.query(`
        INSERT INTO Tool (id, name, description, version, accessLevel, requiresConfirmation, enabled, existent, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE description=VALUES(description), version=VALUES(version)
      `, [
        tool.id,
        tool.name,
        tool.description,
        tool.version,
        tool.accessLevel,
        tool.requiresConfirmation ? 1 : 0,
        tool.enabled ? 1 : 0,
        tool.existent ? 1 : 0,
        tool.createdAt,
        tool.updatedAt
      ]);
    }
    console.log(`  ✓ Transferred ${toolsRes.rows.length} Curator tools to MariaDB.`);
  }

  // Re-enable Foreign Key Checks
  await maria.query('SET FOREIGN_KEY_CHECKS = 1;');

  // Final Parity Table
  console.log('\n================================================================');
  console.log('                    MIGRATION PARITY AUDIT                      ');
  console.log('================================================================');
  console.log(`Table Name         | Source PG     | Target MariaDB | Status`);
  console.log(`----------------------------------------------------------------`);
  for (const r of parityReport) {
    console.log(`${r.table.padEnd(18)} | ${r.source.toLocaleString().padEnd(13)} | ${r.target.toLocaleString().padEnd(14)} | ${r.status}`);
  }
  const [tCnt] = await maria.query('SELECT count(*) as count FROM Tool');
  console.log(`${'Tool (Curator)'.padEnd(18)} | ${toolsRes.rows.length.toString().padEnd(13)} | ${tCnt[0].count.toString().padEnd(14)} | ${toolsRes.rows.length === tCnt[0].count ? '✅ OK' : '❌ MISMATCH'}`);
  console.log('================================================================\n');

  await pgKeeris.end();
  await pgCurator.end();
  await maria.end();
  console.log('✓ Migration to remote MariaDB completed successfully!');
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
