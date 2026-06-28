import { web_scraper } from './web_scraper.js';
import { process_feed } from './process_feed.js';
import { schedule_agent } from './schedule_agent.js';
import { cancel_scheduled_agent } from './cancel_scheduled_agent.js';


export const toolRegistry: Record<string, any> = {
  web_scraper,
  process_feed,
  schedule_agent,
  cancel_scheduled_agent
};
