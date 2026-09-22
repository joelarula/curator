import { openDatabase } from '../src/db.ts';
import { executeGraphql } from '../src/server/graphql.ts';

async function testSnippet() {
  const db = openDatabase('postgresql://curator:curator_secret@192.168.1.110:5432/keeris?schema=public');
  
  const query = `
    query GetUniqueTracks($search: String) {
      uniqueTracks(search: $search, limit: 10) {
        id
        artist
        title
        snippet
        airings {
          id
          position
          artist
          title
          episodeTitle
        }
      }
    }
  `;

  const res = await executeGraphql(db, query, { search: 'peole' });
  console.log('Errors:', res.errors);
  const epMatches = res.data?.uniqueTracks?.filter(t => String(t.id).startsWith('ep-'));
  console.log('Episode matches count:', epMatches?.length);
  for (const ep of epMatches || []) {
    console.log('\nID:', ep.id);
    console.log('Title:', ep.title);
    console.log('Snippet:', ep.snippet);
    console.log('Top Airing:', ep.airings?.[0]);
  }

  await db.close();
}

testSnippet().catch(console.error);

