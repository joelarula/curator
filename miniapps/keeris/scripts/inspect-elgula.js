async function inspectElgula() {
  const url = 'https://vikerraadio.err.ee/817942/stuudios-on-jaan-elgula-2-tund/818433';
  console.log('Inspecting:', url);
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  console.log('HTML size:', html.length);

  // Check category or series from ERR API
  try {
    const apiRes = await fetch('https://services.err.ee/api/v2/category/getByUrl?url=' + encodeURIComponent(url));
    if (apiRes.ok) {
      const apiJson = await apiRes.json();
      console.log('ERR API Category info:', JSON.stringify(apiJson, null, 2));
    }
  } catch (e) {
    console.log('ERR API error:', e.message);
  }

  // Let's also search for series ID 817942 in ERR API
  try {
    const sRes = await fetch('https://services.err.ee/api/v2/vodContent/getVodContentList?category=817942&limit=5');
    if (sRes.ok) {
      const sJson = await sRes.json();
      console.log('ERR getVodContentList(817942):', JSON.stringify(sJson?.data?.vodContentList?.slice(0, 2), null, 2));
      console.log('Total available items:', sJson?.data?.total);
    }
  } catch (e) {
    console.log('ERR vodContentList error:', e.message);
  }
}

inspectElgula().catch(console.error);
