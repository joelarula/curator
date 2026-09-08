import { ErrClient } from '../src/err-client.js';

async function testSoovideAegApi() {
  const client = new ErrClient();
  
  console.log('Testing with radiomanUrl=soovide_aeg...');
  try {
    const res1 = await client.archive({ radiomanUrl: 'soovide_aeg', seriesContentId: '', limit: 10 });
    console.log('radiomanUrl=soovide_aeg result count:', res1?.data?.length);
    if (res1?.data?.length) {
      console.log('Sample item:', res1.data[0]);
    }
  } catch (e) {
    console.log('res1 error:', e.message);
  }

  console.log('\nTesting with radiomanUrl=soovideaeg...');
  try {
    const res2 = await client.archive({ radiomanUrl: 'soovideaeg', seriesContentId: '', limit: 10 });
    console.log('radiomanUrl=soovideaeg result count:', res2?.data?.length);
    if (res2?.data?.length) {
      console.log('Sample item:', res2.data[0]);
    }
  } catch (e) {
    console.log('res2 error:', e.message);
  }

  console.log('\nTesting with seriesContentId=soovide_aeg...');
  try {
    const res3 = await client.archive({ seriesContentId: 'soovide_aeg', limit: 10 });
    console.log('seriesContentId=soovide_aeg result count:', res3?.data?.length);
    if (res3?.data?.length) {
      console.log('Sample item:', res3.data[0]);
    }
  } catch (e) {
    console.log('res3 error:', e.message);
  }
}

testSoovideAegApi().catch(console.error);
