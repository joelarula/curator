import { ErrClient } from '../src/err-client.js';

async function testSeriesIds() {
  const client = new ErrClient();
  
  console.log('Testing seriesContentId=1038019...');
  const res1 = await client.archive({ seriesContentId: '1038019', limit: 10 });
  console.log('1038019 count:', res1?.data?.length);
  if (res1?.data?.length) {
    console.log('1038019 sample heading:', res1.data[0].heading, '| URL:', res1.data[0].url);
  }

  console.log('\nTesting seriesContentId=soovide_aeg...');
  const res2 = await client.archive({ seriesContentId: 'soovide_aeg', limit: 10 });
  console.log('soovide_aeg count:', res2?.data?.length);
  if (res2?.data?.length) {
    console.log('soovide_aeg sample heading:', res2.data[0].heading, '| URL:', res2.data[0].url);
  }
}

testSeriesIds().catch(console.error);
