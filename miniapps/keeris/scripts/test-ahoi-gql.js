import fetch from 'node-fetch';

async function checkAhoi() {
  const res = await fetch('http://localhost:4000/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `query {
        uniqueTracks(search: "ahoi", limit: 5) {
          id
          title
          artist
          airings {
            date
            programTitle
            episodeTitle
            episodeDescription
          }
        }
      }`
    })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

checkAhoi().catch(console.error);
