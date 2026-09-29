#!/usr/bin/env node
/**
 * Keeris On-Demand Database Sync Script
 * 
 * Synchronizes scraped ERR radio data (programs, episodes, unique_tracks, tracks, episode_metadata, playlists)
 * from your local/staging database (MariaDB/MySQL, SQLite, or PostgreSQL) into your remote production VM database.
 * 
 * Usage:
 *   node scripts/sync-db-remote.mjs [options]
 *   npm run sync:remote -- [options]
 * 
 * Options:
 *   --source, -s   Source DB URL or file path (default: process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL)
 *   --target, -t   Target DB URL (default: process.env.TARGET_DATABASE_URL || process.env.REMOTE_DATABASE_URL)
 *   --batch, -b    Batch size for chunked upserts (default: 1000)
 *   --tables       Comma-separated list of tables to sync (default: all)
 *   --dry-run      Audit source and target row counts without modifying target
 *   --clean        Truncate target tables before inserting (default: false, uses upsert)
 *   --help, -h     Show this help message
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const keerisRoot = path.resolve(__dirname, '..');

// Load .env files if present
const envCandidates = [
  path.join(keerisRoot, '.env'),
  path.join(keerisRoot, '.env.local'),
  path.join(keerisRoot, '.env.production'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
      break;
    } catch (_) {}
  }
}

// Parse command-line flags
const args = process.argv.slice(2);
function getArg(keys, defaultValue = null) {
  for (let i = 0; i < args.length; i++) {
    for (const key of keys) {
      if (args[i] === key) {
        return args[i + 1] || defaultValue;
      }
      if (args[i].startsWith(`${key}=`)) {
        return args[i].slice(key.length + 1);
      }
    }
  }
  return defaultValue;
}

const hasFlag = (keys) => args.some(arg => keys.includes(arg) || keys.some(k => arg.startsWith(`${k}=`)));

if (hasFlag(['--help', '-h'])) {
  console.log(`
Keeris Database Sync Utility
-----------------------------
Synchronizes scraped Keeris domain database to a remote VM on demand.

Options:
  --source, -s   Source DB URL or SQLite path
                 (Default: process.env.SOURCE_DATABASE_URL or DATABASE_URL)
  --target, -t   Target Remote DB URL
                 (Default: process.env.TARGET_DATABASE_URL or REMOTE_DATABASE_URL)
  --batch, -b    Batch size per chunk (default: 1000)
  --tables       Comma-separated table list to sync (e.g. programs,episodes,tracks)
  --dry-run      Simulate sync and display row count diffs without making changes
  --clean        Truncate target tables before inserting (Full clean replacement)
  --help, -h     Display this help

Examples:
  npm run sync:remote
  npm run sync:remote -- --target="mysql://user:pass@remote-vm:3306/keeris"
  npm run sync:remote -- --source="./data/keeris.db" --target="mysql://user:pass@185.169.68.23:3306/keeris"
  npm run sync:remote -- --dry-run
`);
  process.exit(0);
}

const isDryRun = hasFlag(['--dry-run']);
const isClean = hasFlag(['--clean']);
const batchSize = parseInt(getArg(['--batch', '-b'], '1000'), 10);
const requestedTables = getArg(['--tables'], null);

const DEFAULT_SOURCE_URL = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL || 'mysql://curator:curator_secret@192.168.1.110:3306/keeris';
const DEFAULT_REMOTE_URL = process.env.TARGET_DATABASE_URL || process.env.REMOTE_DATABASE_URL || process.env.REMOTE_DB_URL;

const sourceUrlRaw = getArg(
  ['--source', '-s'],
  DEFAULT_SOURCE_URL
);

let targetUrlRaw = getArg(
  ['--target', '-t'],
  DEFAULT_REMOTE_URL
);

// If target URL contains @localhost/ and we are running from outside the remote VM, resolve to remote IP
const remoteHostOverride = getArg(['--host', '-h'], '185.169.68.23');
if (targetUrlRaw.includes('@localhost') || targetUrlRaw.includes('@127.0.0.1')) {
  targetUrlRaw = targetUrlRaw.replace(/@(localhost|127\.0\.0\.1)(:\d+)?\//, `@${remoteHostOverride}:3306/`);
}

const sourceUrl = sourceUrlRaw;
const targetUrl = targetUrlRaw;

const withCurator = hasFlag(['--with-curator', '--curator']);

// All domain tables in foreign-key dependency order
const DOMAIN_SYNC_TABLES = [
  'programs',
  'episodes',
  'unique_tracks',
  'tracks',
  'episode_metadata',
  'playlists',
  'playlist_items'
];

const CURATOR_SYNC_TABLES = [
  'Tool',
  'Agent',
  'User',
  'Project',
  'Role',
  'Permission',
  'UserRole',
  'RolePermission'
];

const ALL_SYNC_TABLES = withCurator ? [...DOMAIN_SYNC_TABLES, ...CURATOR_SYNC_TABLES] : DOMAIN_SYNC_TABLES;

const TABLES_TO_SYNC = requestedTables
  ? requestedTables.split(',').map(t => t.trim()).filter(t => ALL_SYNC_TABLES.includes(t))
  : ALL_SYNC_TABLES;

function maskUrl(url) {
  if (!url) return '<undefined>';
  return url.replace(/:([^:@]+)@/, ':****@');
}

/**
 * Universal Database Client Wrapper
 */
class UniversalDbClient {
  constructor(urlOrPath, label = 'DB') {
    this.raw = urlOrPath;
    this.label = label;
    this.type = 'unknown';
    this.client = null;
  }

  async connect() {
    const raw = this.raw;
    if (!raw) {
      throw new Error(`[${this.label}] Connection string/path is required.`);
    }

    if (raw.startsWith('mysql://') || raw.startsWith('mariadb://') || raw.startsWith('mysql2://')) {
      this.type = 'mysql';
      this.client = await mysql.createConnection({
        uri: raw,
        connectTimeout: 20000,
        supportBigNumbers: true,
        bigNumberStrings: true,
        dateStrings: true
      });
    } else if (raw.startsWith('postgres://') || raw.startsWith('postgresql://')) {
      this.type = 'postgres';
      const pgModule = await import('pg');
      const Client = pgModule.default?.Client || pgModule.Client;
      this.client = new Client({ connectionString: raw, statement_timeout: 30000 });
      await this.client.connect();
    } else if (raw.endsWith('.db') || raw.endsWith('.sqlite') || fs.existsSync(raw)) {
      this.type = 'sqlite';
      const { DatabaseSync } = await import('node:sqlite');
      this.client = new DatabaseSync(raw);
    } else {
      // Default to mysql if unknown connection string
      this.type = 'mysql';
      this.client = await mysql.createConnection({
        uri: raw,
        connectTimeout: 20000,
        supportBigNumbers: true,
        bigNumberStrings: true,
        dateStrings: true
      });
    }
  }

  async query(sql, params = []) {
    if (this.type === 'mysql') {
      const [rows] = await this.client.query(sql, params);
      return rows;
    } else if (this.type === 'postgres') {
      let idx = 1;
      const pgSql = sql.replace(/\?/g, () => `$${idx++}`).replace(/`([^`]+)`/g, '"$1"');
      const res = await this.client.query(pgSql, params);
      return res.rows;
    } else if (this.type === 'sqlite') {
      const stmt = this.client.prepare(sql);
      if (/^\s*(select|pragma)/i.test(sql)) {
        return stmt.all(...params);
      } else {
        const info = stmt.run(...params);
        return info;
      }
    }
  }

  async getTableColumns(tableName) {
    if (this.type === 'mysql') {
      const rows = await this.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position`,
        [tableName]
      );
      return rows.map(r => r.column_name || r.COLUMN_NAME);
    } else if (this.type === 'postgres') {
      const rows = await this.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [tableName]
      );
      return rows.map(r => r.column_name);
    } else if (this.type === 'sqlite') {
      const rows = await this.query(`PRAGMA table_info(${tableName})`);
      return rows.map(r => r.name);
    }
    return [];
  }

  async getRowCount(tableName) {
    try {
      const res = await this.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
      if (Array.isArray(res) && res.length > 0) {
        return Number(res[0].count ?? res[0].COUNT ?? 0);
      }
      return 0;
    } catch (_) {
      return 0;
    }
  }

  async close() {
    if (!this.client) return;
    try {
      if (this.type === 'mysql') {
        await this.client.end();
      } else if (this.type === 'postgres') {
        await this.client.end();
      } else if (this.type === 'sqlite') {
        this.client.close();
      }
    } catch (_) {}
  }
}

/**
 * Ensure schemas on target MySQL/MariaDB
 */
async function ensureTargetTables(target) {
  if (target.type !== 'mysql') return;

  await target.query(`
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

  await target.query(`
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

  await target.query(`
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

  await target.query(`
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

  await target.query(`
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

  await target.query(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await target.query(`
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
}

/**
 * Build dynamic upsert query for MySQL/MariaDB target
 */
function buildMySqlUpsertSql(table, columns) {
  const colSql = columns.map(c => `\`${c}\``).join(', ');
  const placeholder = `(${columns.map(() => '?').join(', ')})`;

  // Build ON DUPLICATE KEY UPDATE clause excluding primary key 'id'
  const updateCols = columns.filter(c => c !== 'id' && c !== 'created_at');
  let updateClause = '';
  if (updateCols.length > 0) {
    updateClause = ' ON DUPLICATE KEY UPDATE ' + updateCols.map(c => `\`${c}\`=VALUES(\`${c}\`)`).join(', ');
  } else {
    // If no updatable columns, ignore duplicate
    return {
      getInsertSql: (count) => `INSERT IGNORE INTO \`${table}\` (${colSql}) VALUES ${Array(count).fill(placeholder).join(', ')}`
    };
  }

  return {
    getInsertSql: (count) => `INSERT INTO \`${table}\` (${colSql}) VALUES ${Array(count).fill(placeholder).join(', ')}${updateClause}`
  };
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('       KEERIS DATABASE ON-DEMAND REMOTE SYNC PIPELINE        ');
  console.log('='.repeat(70));
  console.log(`Source Database : ${maskUrl(sourceUrl)}`);
  console.log(`Target Remote VM: ${targetUrl ? maskUrl(targetUrl) : '❌ NOT SPECIFIED (Use --target or TARGET_DATABASE_URL)'}`);
  console.log(`Batch Size      : ${batchSize} rows`);
  console.log(`Mode            : ${isDryRun ? '🔍 DRY RUN (Audit Only)' : (isClean ? '⚠️ CLEAN (Truncate & Replace)' : '⚡ INCREMENTAL UPSERT')}`);
  console.log('='.repeat(70) + '\n');

  if (!targetUrl && !isDryRun) {
    console.error(`❌ Error: Target remote database URL not provided.`);
    console.error(`\nPlease specify the target database using the --target flag or TARGET_DATABASE_URL in .env:`);
    console.error(`  npm run sync:remote -- --target="mysql://curator:curator_secret@<remote-ip>:3306/keeris"`);
    console.error(`\nOr test in dry-run mode with:`);
    console.error(`  npm run sync:remote -- --dry-run\n`);
    process.exit(1);
  }

  const source = new UniversalDbClient(sourceUrl, 'Source');
  let target = null;
  if (targetUrl) {
    target = new UniversalDbClient(targetUrl, 'Target (Remote VM)');
  }

  try {
    console.log('[1/4] Connecting to source database...');
    await source.connect();
    console.log(`  ✓ Source connected (${source.type})`);

    if (target) {
      console.log('[2/4] Connecting to target remote database...');
      await target.connect();
      console.log(`  ✓ Target connected (${target.type})`);

      if (!isDryRun) {
        console.log('  → Ensuring target tables & schemas exist...');
        await target.query('SET FOREIGN_KEY_CHECKS = 0;');
        await target.query('SET sql_mode = "NO_AUTO_VALUE_ON_ZERO";');
        await ensureTargetTables(target);
        console.log('  ✓ Target schema verified.');
      }
    } else {
      console.log('[2/4] Target connection skipped (Dry-run mode).');
    }

    console.log('\n[3/4] Synchronizing Keeris domain tables...');
    const auditReport = [];

    for (const table of TABLES_TO_SYNC) {
      const srcCount = await source.getRowCount(table);
      const tgtBeforeCount = target ? await target.getRowCount(table) : 0;

      if (srcCount === 0) {
        auditReport.push({
          table,
          source: 0,
          targetBefore: tgtBeforeCount,
          targetAfter: tgtBeforeCount,
          transferred: 0,
          status: '⚡ SKIPPED (Empty)'
        });
        continue;
      }

      if (isDryRun || !target) {
        auditReport.push({
          table,
          source: srcCount,
          targetBefore: tgtBeforeCount,
          targetAfter: tgtBeforeCount,
          transferred: 0,
          status: srcCount === tgtBeforeCount ? '✅ IN SYNC' : `⚠️ DIFF (${srcCount - tgtBeforeCount} rows)`
        });
        console.log(`  • ${table.padEnd(18)} : Source=${srcCount.toLocaleString().padStart(7)} | Target=${tgtBeforeCount.toLocaleString().padStart(7)}`);
        continue;
      }

      // If clean mode, truncate table first (in reverse FK order or with foreign keys disabled)
      if (isClean) {
        await target.query(`TRUNCATE TABLE \`${table}\``);
      }

      // Get columns available in source
      const srcCols = await source.getTableColumns(table);
      if (srcCols.length === 0) {
        console.warn(`  ⚠️ Could not read columns for ${table}, skipping.`);
        continue;
      }

      const { getInsertSql } = buildMySqlUpsertSql(table, srcCols);
      const startTime = Date.now();
      let offset = 0;
      let totalInserted = 0;

      while (offset < srcCount) {
        const rows = await source.query(
          `SELECT * FROM \`${table}\` ORDER BY 1 LIMIT ${batchSize} OFFSET ${offset}`
        );
        if (!rows || rows.length === 0) break;

        const flatParams = [];
        for (const row of rows) {
          for (const col of srcCols) {
            let val = row[col];
            if (val instanceof Date) {
              val = val.toISOString().slice(0, 19).replace('T', ' ');
            } else if (typeof val === 'object' && val !== null) {
              val = JSON.stringify(val);
            }
            flatParams.push(val);
          }
        }

        const insertSql = getInsertSql(rows.length);
        await target.query(insertSql, flatParams);

        totalInserted += rows.length;
        offset += rows.length;
        const pct = Math.round((offset / srcCount) * 100);
        process.stdout.write(`  -> Syncing ${table.padEnd(18)} : ${offset.toLocaleString()} / ${srcCount.toLocaleString()} (${pct}%)\r`);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const tgtAfterCount = await target.getRowCount(table);

      console.log(`  ✓ ${table.padEnd(18)} : Synced ${srcCount.toLocaleString()} rows in ${duration}s (Target total: ${tgtAfterCount.toLocaleString()})          `);

      auditReport.push({
        table,
        source: srcCount,
        targetBefore: tgtBeforeCount,
        targetAfter: tgtAfterCount,
        transferred: totalInserted,
        duration: `${duration}s`,
        status: srcCount === tgtAfterCount ? '✅ IN SYNC' : '✅ SYNCED'
      });
    }

    if (target && !isDryRun) {
      await target.query('SET FOREIGN_KEY_CHECKS = 1;');
    }

    // Step 4: Final Summary Audit
    console.log('\n[4/4] Audit & Synchronization Report');
    console.log('='.repeat(80));
    console.log(`Table Name         | Source Count | Target Before | Target After  | Status`);
    console.log('-'.repeat(80));
    for (const r of auditReport) {
      console.log(
        `${r.table.padEnd(18)} | ` +
        `${r.source.toLocaleString().padStart(12)} | ` +
        `${r.targetBefore.toLocaleString().padStart(13)} | ` +
        `${r.targetAfter.toLocaleString().padStart(13)} | ` +
        `${r.status}`
      );
    }
    console.log('='.repeat(80));
    console.log(`\n🎉 Sync finished successfully!\n`);

  } catch (err) {
    console.error(`\n❌ Sync failed:`, err);
    process.exit(1);
  } finally {
    await source.close();
    if (target) await target.close();
  }
}

main();
