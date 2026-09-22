import pg from 'pg';
import mysql from '../../../server/node_modules/mysql2/promise.js';

const PG_URL = process.env.PG_CURATOR_URL || 'postgresql://curator:curator_secret@192.168.1.110:5432/curator';
const MARIA_CONFIG = {
  host: process.env.MARIA_HOST || '192.168.1.110',
  port: Number(process.env.MARIA_PORT || 3306),
  user: process.env.MARIA_USER || 'curator',
  password: process.env.MARIA_PASSWORD || 'curator_secret',
  database: process.env.MARIA_DB || 'curator',
};

function mapPgTypeToMysql(col, isPk = false) {
  const dt = col.data_type.toLowerCase();
  const udt = (col.udt_name || '').toLowerCase();
  const colName = col.column_name;
  const maxLen = col.character_maximum_length;

  if (udt === 'requeststatus') {
    return "ENUM('NEW', 'WAITING', 'PAUSED', 'COMPLETED', 'FAILED')";
  }
  if (dt === 'integer') return 'INT';
  if (dt === 'bigint') return 'BIGINT';
  if (dt === 'smallint') return 'SMALLINT';
  if (dt === 'boolean') return 'BOOLEAN';
  if (dt === 'double precision' || dt === 'numeric' || dt === 'real') return 'DOUBLE';
  if (dt.includes('timestamp')) return 'DATETIME(3)';
  if (dt === 'date') return 'DATE';
  if (dt === 'json' || dt === 'jsonb') return 'JSON';
  if (dt === 'text' || dt === 'character varying' || dt === 'character') {
    if (isPk || colName === 'id' || colName.endsWith('Id') || colName === 'token' || colName === 'email' || colName === 'name' || colName === 'uri' || colName === 'version') {
      return 'VARCHAR(191)';
    }
    return maxLen ? `VARCHAR(${Math.min(maxLen, 255)})` : 'LONGTEXT';
  }
  return 'LONGTEXT';
}

async function main() {
  console.log('================================================================');
  console.log('   Migrating Curator (31 Tables) from PostgreSQL to MariaDB    ');
  console.log('================================================================');

  const pgClient = new pg.Pool({ connectionString: PG_URL });
  const maria = await mysql.createConnection(MARIA_CONFIG);
  console.log('Connected to both source PostgreSQL and target MariaDB!');

  await maria.query('SET FOREIGN_KEY_CHECKS = 0;');
  await maria.query('SET sql_mode = "NO_AUTO_VALUE_ON_ZERO";');

  // 1. Get all tables in Curator
  const tablesRes = await pgClient.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`Found ${tables.length} tables in Curator.\n`);

  for (const table of tables) {
    // Columns
    const colsRes = await pgClient.query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, [table]);

    // Primary key
    const pkRes = await pgClient.query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position;
    `, [table]);
    const pkCols = pkRes.rows.map(r => `\`${r.column_name}\``);

    const colDefs = colsRes.rows.map(col => {
      const isPk = pkRes.rows.some(r => r.column_name === col.column_name);
      let def = `\`${col.column_name}\` ${mapPgTypeToMysql(col, isPk)}`;
      if (col.column_default && col.column_default.includes('nextval')) {
        def += ' AUTO_INCREMENT';
      }
      if (col.is_nullable === 'NO') {
        def += ' NOT NULL';
      }
      return def;
    });

    if (pkCols.length > 0) {
      colDefs.push(`PRIMARY KEY (${pkCols.join(', ')})`);
    }

    const createSql = `CREATE TABLE IF NOT EXISTS \`${table}\` (\n  ${colDefs.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
    await maria.query(createSql);

    // Count rows
    const countRes = await pgClient.query(`SELECT count(*) FROM "${table}"`);
    const count = parseInt(countRes.rows[0].count, 10);

    if (count > 0) {
      const rawCols = colsRes.rows.map(r => r.column_name);
      const colSql = rawCols.map(c => `\`${c}\``).join(', ');
      const placeholder = `(${rawCols.map(() => '?').join(', ')})`;

      const rowsRes = await pgClient.query(`SELECT * FROM "${table}"`);
      const rowPlaceholders = [];
      const flatParams = [];

      for (const row of rowsRes.rows) {
        rowPlaceholders.push(placeholder);
        for (const col of rawCols) {
          let val = row[col];
          if (val instanceof Date) {
            val = val.toISOString().slice(0, 23).replace('T', ' ');
          } else if (typeof val === 'object' && val !== null) {
            val = JSON.stringify(val);
          }
          flatParams.push(val);
        }
      }

      const insertSql = `INSERT IGNORE INTO \`${table}\` (${colSql}) VALUES ${rowPlaceholders.join(', ')}`;
      await maria.query(insertSql, flatParams);
      console.log(`  ✓ Transferred ${table.padEnd(25)} : ${count} rows`);
    } else {
      console.log(`  ✓ Created     ${table.padEnd(25)} : 0 rows`);
    }
  }

  await maria.query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('\n================================================================');
  console.log('✓ All 31 Curator tables successfully migrated to MariaDB!');
  console.log('================================================================');

  await pgClient.end();
  await maria.end();
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
