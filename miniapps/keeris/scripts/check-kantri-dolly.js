import pg from 'pg';

async function checkKantri() {
  const client = new pg.Client('postgresql://curator:curator_secret@192.168.1.110:5432/keeris');
  await client.connect();

  console.log('=== Checking Program ===');
  const progRes = await client.query("SELECT * FROM programs WHERE title ILIKE '%kantri%' OR slug ILIKE '%kantri%'");
  console.log(progRes.rows);

  console.log('\n=== Checking Specific Episode (1230097) ===');
  const epRes = await client.query("SELECT e.*, p.title as program_title FROM episodes e LEFT JOIN programs p ON p.id=e.program_id WHERE e.id = 1230097 OR e.url LIKE '%1230097%' OR e.title ILIKE '%dolly parton%'");
  console.log(epRes.rows);

  if (epRes.rows.length > 0) {
    const epId = epRes.rows[0].id;
    const tracksRes = await client.query("SELECT * FROM tracks WHERE episode_id = $1 ORDER BY position", [epId]);
    console.log(`\n=== Tracks for episode ${epId} (${tracksRes.rows.length} tracks) ===`);
    console.log(tracksRes.rows);

    const metaRes = await client.query("SELECT * FROM episode_metadata WHERE episode_id = $1", [epId]);
    console.log(`\n=== Metadata for episode ${epId} ===`);
    console.log(metaRes.rows);
  }

  console.log('\n=== Summary of All "Kantri alati jääb" Episodes in DB ===');
  const allKantriRes = await client.query(`
    SELECT e.parse_status, count(*) as count, count(t.id) as total_tracks
    FROM episodes e
    LEFT JOIN programs p ON p.id=e.program_id
    LEFT JOIN tracks t ON t.episode_id=e.id
    WHERE p.title ILIKE '%kantri%' OR e.title ILIKE '%kantri%'
    GROUP BY e.parse_status
  `);
  console.log(allKantriRes.rows);

  await client.end();
}

checkKantri().catch(console.error);
