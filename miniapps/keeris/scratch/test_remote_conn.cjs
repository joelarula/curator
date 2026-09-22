const mysql = require('mysql2/promise');

async function test() {
  console.log('Testing connection to remote MariaDB 185.169.68.23:3306...');
  try {
    const conn = await mysql.createConnection({
      host: '185.169.68.23',
      port: 3306,
      user: 'sepisedc_curator_keeris_admin',
      password: ',ijI]EQ-z6=H6aem',
      database: 'sepisedc_curator_keeris',
      connectTimeout: 10000,
    });
    console.log('✓ Successfully connected to remote MariaDB!');
    const [tables] = await conn.query('SHOW TABLES');
    console.log('Remote tables currently in database:', tables.map(r => Object.values(r)[0]));
    await conn.end();
  } catch (err) {
    console.error('Remote connection error:', err.message);
  }
}

test();
