import { ScraperService } from '../src/services/ScraperService.js';

const url = process.argv[2] || 'https://www.err.ee/1609272378/eesti-laulu-finaal-on-juba-tana';
const result = await ScraperService.extractFromUrl(url);

// Print first 3000 chars of the full markdown to validate
console.log(result.content.substring(0, 3000));
console.log('\n---\nKeywords:', result.keywords);
console.log('Author:', result.author);
