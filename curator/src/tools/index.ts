import { web_scraper } from './web_scraper.js';
import { process_feed } from './process_feed.js';

export const toolRegistry: Record<string, any> = {
  web_scraper,
  process_feed
};
