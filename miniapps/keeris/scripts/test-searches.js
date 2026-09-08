async function testSearches() {
  const terms = ['Võõras'];

  for (const term of terms) {
    console.log(`\nTesting search: "${term}"...`);
    const res = await fetch('http://192.168.1.110:4000/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `query($search: String) {
          uniqueTracks(search: $search, limit: 10) {
            id
            artist
            title
            playCount
            airings {
              id
              episodeTitle
            }
          }
        }`,
        variables: { search: term }
      })
    });
    console.log(`Status for "${term}":`, res.status);
    const json = await res.json();
    if (json.errors) {
      console.error(`Errors for "${term}":`, json.errors);
    } else {
      console.log(`Results for "${term}":`, JSON.stringify(json.data.uniqueTracks, null, 2));
    }
  }
}

testSearches().catch(console.error);
