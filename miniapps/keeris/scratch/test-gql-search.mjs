import { openDatabase } from '../src/db.ts';
import { executeGraphql } from '../src/server/graphql.ts';

async function testGqlSearch() {
  // Use our test db that had 50 tracks saved earlier if available, or data/keeris.db
  const db = openDatabase('data/keeris.db');
  
  const query = `
    query GetUniqueTracks($search: String, $limit: Int) {
      stats(search: $search) {
        episodes
        tracks
        uniqueTracks
        programs
      }
      uniqueTracks(search: $search, limit: $limit) {
        id
        artist
        title
        playCount
        airings {
          date
          programTitle
          episodeTitle
          episodeUrl
        }
      }
    }
  `;

  const res = await executeGraphql(db, query, { search: '', limit: 5 });
  console.log('Result:', JSON.stringify(res, null, 2));
  db.close();
}
testGqlSearch();
