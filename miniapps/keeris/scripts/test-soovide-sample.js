import { ErrClient } from '../src/err-client.js';
import { parseMusicList, parseEpisodeText } from '../src/episode-parser.js';

async function testSampleEps() {
  const client = new ErrClient();
  const res = await client.archive({ seriesContentId: '1038019', limit: 10 });
  console.log(`Checking ${res.data.length} episodes for tracklists...`);

  for (const item of res.data.slice(0, 5)) {
    console.log(`\nFetching ${item.id} (${item.heading}, ${item.url})...`);
    const html = await client.episode(item.url);
    const tracks = parseMusicList(html);
    const text = parseEpisodeText(html);
    console.log(`  Tracks: ${tracks.length}`);
    if (tracks.length > 0) console.log('  Sample tracks:', tracks.slice(0, 3));
    console.log(`  Description: ${text.description?.slice(0, 100)}`);
  }
}

testSampleEps().catch(console.error);
