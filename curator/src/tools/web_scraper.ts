import { webFetchRawTool, webScrapeTool } from '@curator/plugin-scraper';
import { defineTool } from './CuratorTool.js';

/** Raw response text (HTML, XML/RSS/Atom, JSON); e.g. feed XML for `process_feed`. */
export const web_scraper = defineTool(webFetchRawTool());

/** Main page content as Markdown. */
export const web_scrape = defineTool(webScrapeTool());
