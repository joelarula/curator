async function testFrontendQueries() {
  console.log('Testing Query 1: stats...');
  const res1 = await fetch('http://192.168.1.110:4000/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ stats { tracks uniqueTracks } }' })
  });
  console.log('Stats status:', res1.status);
  const data1 = await res1.json();
  console.log('Stats response:', data1);

  console.log('\nTesting Query 2: uniqueTracks with blank search...');
  const res2 = await fetch('http://192.168.1.110:4000/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `query($search: String) {
        uniqueTracks(search: $search, limit: 200) {
          id
          artist
          title
          playCount
          firstPlayedAt
          lastPlayedAt
          airings {
            id
            position
            date
            episodeTitle
            episodeUrl
            programTitle
            episodeDescription
          }
        }
      }`,
      variables: { search: '' }
    })
  });
  console.log('uniqueTracks status:', res2.status);
  const data2 = await res2.json();
  if (data2.errors) {
    console.error('uniqueTracks errors:', JSON.stringify(data2.errors, null, 2));
  } else {
    console.log('uniqueTracks count:', data2.data.uniqueTracks?.length);
  }
}

testFrontendQueries().catch(console.error);
