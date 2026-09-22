const mysql = require('mysql2/promise');

async function reset() {
  console.log('Connecting to MariaDB to reset curator database...');
  const conn = await mysql.createConnection('mysql://curator:curator_secret@192.168.1.110:3306');
  await conn.query('DROP DATABASE IF EXISTS curator');
  await conn.query('CREATE DATABASE curator CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  console.log('✓ Database `curator` dropped and recreated clean!');
  await conn.end();
}

reset().catch(console.error);
