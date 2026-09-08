import { ErrClient } from '../src/err-client.js';

async function findSeries() {
  const client = new ErrClient();
  const res = await client.search('Stuudios on Jaan Elgula');
  console.log('Search results count:', res?.data?.length);
  if (res?.data?.length) {
    console.log('Sample result:', res.data.slice(0, 3));
  }
}

findSeries().catch(console.error);
