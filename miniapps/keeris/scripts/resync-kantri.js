import pg from 'pg';
import { parseMusicList, parseEpisodeText } from '../src/episode-parser.js';
import { makeFingerprint } from '../src/db.js';

async function resyncKantri() {
  const client = new pg.Client('postgresql://curator:curator_secret@192.168.1.110:5432/keeris');
  await client.connect();

  console.log('Fetching episodes for "Kantri alati jääb"...');
  const epRes = await client.query(`
    SELECT e.id, e.url, e.title, e.scheduled_at, COUNT(t.id) as track_count
    FROM episodes e
    LEFT JOIN programs p ON p.id=e.program_id
    LEFT JOIN tracks t ON t.episode_id=e.id
    WHERE p.title ILIKE '%kantri%'
    GROUP BY e.id, e.url, e.title, e.scheduled_at
    ORDER BY e.id
  `);

  console.log(`Found ${epRes.rows.length} episodes.`);
  let totalNewTracks = 0;

  for (const ep of epRes.rows) {
    try {
      console.log(`\nFetching ${ep.id}: ${ep.title}...`);
      const res = await fetch(ep.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) {
        console.warn(`  Failed to fetch: ${res.status}`);
        continue;
      }
      const html = await res.text();
      const tracks = parseMusicList(html);
      const textMeta = parseEpisodeText(html);

      // Update episode_metadata
      await client.query(`
        INSERT INTO episode_metadata (episode_id, description, full_text, summary)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (episode_id) DO UPDATE
        SET description = EXCLUDED.description,
            full_text = EXCLUDED.full_text,
            summary = EXCLUDED.summary
      `, [ep.id, textMeta.description, textMeta.fullText, textMeta.summary]);

      if (tracks.length > 0) {
        console.log(`  ✓ Found ${tracks.length} tracks!`);
        // Delete existing tracks for this ep
        await client.query('DELETE FROM tracks WHERE episode_id = $1', [ep.id]);

        for (const tr of tracks) {
          const fp = makeFingerprint(tr.artist, tr.title, tr.rawText);
          let uniqueTrackId = null;

          if (fp) {
            const uRes = await client.query(`
              INSERT INTO unique_tracks (fingerprint, artist, title, play_count, first_played_at, last_played_at)
              VALUES ($1, $2, $3, 1, $4, $4)
              ON CONFLICT (fingerprint) DO UPDATE
              SET play_count = unique_tracks.play_count + 1,
                  last_played_at = GREATEST(unique_tracks.last_played_at, EXCLUDED.last_played_at)
              RETURNING id
            `, [fp, tr.artist, tr.title, ep.scheduled_at]);
            uniqueTrackId = uRes.rows[0]?.id;
          }

          await client.query(`
            INSERT INTO tracks (episode_id, unique_track_id, position, artist, title, raw_text)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [ep.id, uniqueTrackId, tr.position, tr.artist, tr.title, tr.rawText]);
          totalNewTracks++;
        }

        await client.query("UPDATE episodes SET parse_status = 'parsed' WHERE id = $1", [ep.id]);
      } else {
        console.log(`  - No tracklist found in page text.`);
      }
    } catch (err) {
      console.error(`  Error processing ${ep.id}:`, err.message);
    }
  }

  console.log(`\n========================================`);
  console.log(`✓ Re-sync complete. Added ${totalNewTracks} tracks for "Kantri alati jääb"!`);
  console.log(`========================================`);

  await client.end();
}

resyncKantri().catch(console.error);
