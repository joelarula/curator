const mysql = require('mysql2/promise');

async function test() {
  const pool = mysql.createPool('mysql://curator:curator_secret@192.168.1.110:3306/keeris');
  pool.on('connection', (conn) => {
    console.log('Connection event fired!');
    conn.query("SET sql_mode = CONCAT(@@sql_mode, ',PIPES_AS_CONCAT')");
  });

  // When we do pool.query immediately:
  const [res1] = await pool.query("SELECT @@session.sql_mode");
  console.log('Immediate query sql_mode:', res1);

  // Wait 100ms
  await new Promise(r => setTimeout(r, 100));

  const [res2] = await pool.query("SELECT @@session.sql_mode");
  console.log('After 100ms query sql_mode:', res2);

  await pool.end();
}

test().catch(console.error);
