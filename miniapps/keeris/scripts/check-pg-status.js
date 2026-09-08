import pg from 'pg';

async function checkDb() {
  const client = new pg.Client('postgresql://curator:curator_secret@192.168.1.110:5432/keeris');
  await client.connect();

  console.log('=== All Programs in PostgreSQL ===');
  const progs = await client.query('SELECT id, series_id, title, created_at, updated_at FROM programs ORDER BY id');
  console.table(progs.rows);

  console.log('\n=== Program Episode Counts & Last Fetched At ===');
  const counts = await client.query(`
    SELECT p.id, p.title, COUNT(e.id) as total_episodes, COUNT(t.id) as total_tracks, MAX(e.fetched_at) as last_fetched_at
    FROM programs p
    LEFT JOIN episodes e ON e.program_id = p.id
    LEFT JOIN tracks t ON t.episode_id = e.id
    GROUP BY p.id, p.title
    ORDER BY p.id
  `);
  console.table(counts.rows);

  console.log('\n=== Recent Episodes Fetched ===');
  const recents = await client.query(`
    SELECT e.id, e.title, p.title as program_title, e.scheduled_at, e.fetched_at
    FROM episodes e
    LEFT JOIN programs p ON p.id = e.program_id
    ORDER BY e.fetched_at DESC
    LIMIT 10
  `);
  console.table(recents.rows);

  await client.end();
}

checkDb().catch(console.error);
