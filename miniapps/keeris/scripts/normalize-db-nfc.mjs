import mysql from 'mysql2/promise';

async function run() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://curator:curator_secret@192.168.1.110:3306/keeris';
  const conn = await mysql.createConnection(dbUrl);
  console.log('Connected to MySQL. Normalizing Unicode (NFC)...');

  // 1. episode_metadata
  const [metaRows] = await conn.query('SELECT episode_id, description, full_text, summary FROM episode_metadata');
  let metaCount = 0;
  for (const r of metaRows) {
    const dNfc = r.description ? r.description.normalize('NFC') : null;
    const fNfc = r.full_text ? r.full_text.normalize('NFC') : null;
    const sNfc = r.summary ? r.summary.normalize('NFC') : null;
    if (dNfc !== r.description || fNfc !== r.full_text || sNfc !== r.summary) {
      await conn.query(
        'UPDATE episode_metadata SET description = ?, full_text = ?, summary = ? WHERE episode_id = ?',
        [dNfc, fNfc, sNfc, r.episode_id]
      );
      metaCount++;
    }
  }
  console.log(`Updated ${metaCount} episode_metadata rows to NFC.`);

  // 2. episodes
  const [epRows] = await conn.query('SELECT id, title FROM episodes');
  let epCount = 0;
  for (const r of epRows) {
    const tNfc = r.title ? r.title.normalize('NFC') : null;
    if (tNfc !== r.title) {
      await conn.query('UPDATE episodes SET title = ? WHERE id = ?', [tNfc, r.id]);
      epCount++;
    }
  }
  console.log(`Updated ${epCount} episodes rows to NFC.`);

  // 3. tracks
  const [trRows] = await conn.query('SELECT id, artist, title, raw_text FROM tracks');
  let trCount = 0;
  for (const r of trRows) {
    const aNfc = r.artist ? r.artist.normalize('NFC') : null;
    const tNfc = r.title ? r.title.normalize('NFC') : null;
    const rNfc = r.raw_text ? r.raw_text.normalize('NFC') : null;
    if (aNfc !== r.artist || tNfc !== r.title || rNfc !== r.raw_text) {
      await conn.query('UPDATE tracks SET artist = ?, title = ?, raw_text = ? WHERE id = ?', [aNfc, tNfc, rNfc, r.id]);
      trCount++;
    }
  }
  console.log(`Updated ${trCount} tracks rows to NFC.`);

  // 4. unique_tracks
  const [utRows] = await conn.query('SELECT id, artist, title FROM unique_tracks');
  let utCount = 0;
  for (const r of utRows) {
    const aNfc = r.artist ? r.artist.normalize('NFC') : null;
    const tNfc = r.title ? r.title.normalize('NFC') : null;
    if (aNfc !== r.artist || tNfc !== r.title) {
      await conn.query('UPDATE unique_tracks SET artist = ?, title = ? WHERE id = ?', [aNfc, tNfc, r.id]);
      utCount++;
    }
  }
  console.log(`Updated ${utCount} unique_tracks rows to NFC.`);

  await conn.end();
  console.log('Unicode NFC normalization complete.');
}

run().catch(console.error);
