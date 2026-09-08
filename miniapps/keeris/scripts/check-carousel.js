import { ErrClient } from '../src/err-client.js';

async function checkCarousel() {
  const client = new ErrClient();
  const url = 'https://vikerraadio.err.ee/817942/stuudios-on-jaan-elgula-2-tund/818433';
  const html = await client.episode(url);
  const jsonMatch = html.match(/<script id="carouselJsonStruct" type="application\/ld\+json">(.*?)<\/script>/s);
  if (jsonMatch) {
    const data = JSON.parse(jsonMatch[1]);
    console.log('Carousel items count:', data.itemListElement?.length);
    console.log('Carousel sample:', data.itemListElement?.slice(0, 5));
  } else {
    console.log('No carouselJsonStruct found.');
  }
}

checkCarousel().catch(console.error);
