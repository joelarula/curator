async function run() {
  const res = await fetch('http://localhost:4001/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query SearchPeo {
        stats(search: "peo") {
          episodes
          tracks
          uniqueTracks
        }
        uniqueTracks(search: "peo", limit: 5) {
          id
          artist
          title
        }
      }`
    })
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

run().catch(console.error);
