import { openDatabase, saveProgramData } from '../src/db.ts';
import { parseMusicList, parseEpisodeText, parseEpisodeDate } from '../src/episode-parser.ts';
import { ErrClient } from '../src/err-client.ts';

const client = new ErrClient();

async function runRescrape() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://curator:curator_secret@192.168.1.110:3306/keeris';
  console.log(`Connecting to database: ${dbUrl}`);
  const db = openDatabase(dbUrl);

  const missingEpisodes = await db.prepare(`
    SELECT e.id, e.url, e.title, e.scheduled_at as scheduledAt, e.published_at as publishedAt,
           p.id as programId, p.title as programTitle, p.series_id as seriesId,
           COUNT(t.id) as track_count
    FROM episodes e
    LEFT JOIN tracks t ON t.episode_id = e.id
    LEFT JOIN programs p ON p.id = e.program_id
    GROUP BY e.id
    HAVING track_count = 0
    ORDER BY e.scheduled_at DESC
  `).all();

  console.log(`Found ${missingEpisodes.length} episodes with 0 tracks in the database.`);
  if (missingEpisodes.length === 0) {
    console.log('All episodes already have indexed tracks!');
    await db.close();
    return;
  }

  let updatedCount = 0;
  let totalTracksSaved = 0;

  for (let i = 0; i < missingEpisodes.length; i++) {
    const ep = missingEpisodes[i];
    console.log(`[${i + 1}/${missingEpisodes.length}] Checking #${ep.id}: ${ep.title} (${ep.url})...`);

    try {
      const html = await client.episode(ep.url);
      const tracks = parseMusicList(html);
      const metadata = parseEpisodeText(html);
      const parsedDate = parseEpisodeDate(html);

      if (tracks.length > 0) {
        console.log(`  -> Found ${tracks.length} tracks! Saving...`);
        await saveProgramData(db, {
          program: { seriesId: ep.seriesId || '1037846', title: ep.programTitle || 'Vikerraadio' },
          episode: {
            id: ep.id,
            url: ep.url,
            title: ep.title,
            scheduledAt: ep.scheduledAt || parsedDate,
            publishedAt: ep.publishedAt || parsedDate,
          },
          tracks,
          metadata,
          status: 'parsed',
        });
        updatedCount++;
        totalTracksSaved += tracks.length;
      } else {
        console.log(`  -> No tracks found on page.`);
      }

      // Polite pacing to avoid ERR rate limiting
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`  -> Error scraping ${ep.url}:`, err.message);
    }
  }

  console.log(`\nRescrape complete! Updated ${updatedCount} episodes with ${totalTracksSaved} newly indexed tracks.`);
  await db.close();
}

runRescrape().catch(console.error);
