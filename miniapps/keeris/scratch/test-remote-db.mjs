import { openDatabase } from '../src/db.ts';

async function testRemote() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://curator:curator_secret@192.168.1.110:3306/keeris';
  console.log('Testing connection to:', dbUrl.replace(/:[^:@]+@/, ':****@'));
  try {
    const db = openDatabase(dbUrl);
    const count = await db.prepare('SELECT COUNT(*) as c FROM unique_tracks').get();
    console.log('Unique tracks count in database:', count.c);
    const sample = await db.prepare('SELECT artist, title, play_count FROM unique_tracks ORDER BY play_count DESC LIMIT 5').all();
    console.log('Top 5 tracks:', sample);
    if (typeof db.close === 'function') await db.close();
  } catch (err) {
    console.error('Connection error:', err.message);
  }
}
testRemote();
