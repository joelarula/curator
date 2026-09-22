const mysql = require('mysql2/promise');

async function test() {
  const pool = mysql.createPool('mysql://curator:curator_secret@192.168.1.110:3306/keeris');
  pool.on('connection', (c) => {
    c.query("SET sql_mode = CONCAT(@@sql_mode, ',PIPES_AS_CONCAT')");
  });

  // Query 5 times
  for (let i = 0; i < 5; i++) {
    const [rows] = await pool.query("SELECT ut.id, ut.artist, ut.title FROM unique_tracks ut WHERE LOWER(coalesce(ut.artist, '') || ' ' || coalesce(ut.title, '')) LIKE '%peo%' LIMIT 2");
    console.log(`Query ${i}: found ${rows.length} rows`);
  }
  await pool.end();
}

test().catch(console.error);
