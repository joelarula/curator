import { web_scraper } from './web_scraper.js';
import { browser_fetch } from './browser_fetch.js';
import { process_feed } from './process_feed.js';
import { schedule_agent } from './schedule_agent.js';
import { cancel_scheduled_agent } from './cancel_scheduled_agent.js';
import type { CuratorTool } from './CuratorTool.js';

export { web_scraper, browser_fetch, process_feed, schedule_agent, cancel_scheduled_agent };

export const toolRegistry: Record<string, CuratorTool> = {
  web_scraper,
  browser_fetch,
  process_feed,
  schedule_agent,
  cancel_scheduled_agent,
};
