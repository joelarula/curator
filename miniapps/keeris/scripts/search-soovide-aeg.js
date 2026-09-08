async function searchSoovideAeg() {
  console.log('Searching ERR vodContentList for soovide aeg...');
  
  // Try searching vodContentList with phrase
  try {
    const res = await fetch('https://services.err.ee/api/v2/vodContent/getVodContentList?phrase=soovide%20aeg&limit=10');
    if (res.ok) {
      const json = await res.json();
      console.log('vodContentList search results:', json?.data?.total);
      if (json?.data?.vodContentList?.length) {
        for (const item of json.data.vodContentList) {
          console.log(`- ID: ${item.id}, Title: ${item.heading}, Category: ${item.categoryId || item.categoryName}, URL: ${item.url}`);
        }
      }
    }
  } catch (e) {
    console.error('vodContentList error:', e.message);
  }

  // Also check if we can query search API
  try {
    const searchRes = await fetch('https://services.err.ee/api/v2/search/search?phrase=soovide%20aeg&limit=10');
    if (searchRes.ok) {
      const sJson = await searchRes.json();
      console.log('\nsearch/search results:', sJson?.data?.total);
      if (sJson?.data?.items?.length) {
        for (const item of sJson.data.items) {
          console.log(`- [${item.id}] ${item.heading || item.title} | ${item.url}`);
        }
      }
    }
  } catch (e) {
    console.error('search error:', e.message);
  }
}

searchSoovideAeg().catch(console.error);
