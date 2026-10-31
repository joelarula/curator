import { defineTool, type CuratorPluginDefinition } from '@curator/agent-server';
import { webScrapeTool, type SafeFetchOptions } from '@curator/plugin-scraper';

export const WEB_READER_ROLE = 'web_reader';

/** The blueprint server's single remote tool: a public web page as Markdown. */
export function webScrapePlugin(fetchOptions: SafeFetchOptions = {}): CuratorPluginDefinition {
  const webScrape = defineTool({
    ...webScrapeTool(fetchOptions),
    requiredRole: WEB_READER_ROLE,
    mcp: { expose: true },
  });

  return {
    name: 'blueprint-web',
    version: '1.0.0',
    description: 'Blueprint server: web page reading for remote agents',
    tools: { web_scrape: webScrape },
    roles: [{ name: WEB_READER_ROLE, description: 'May read public web pages through web_scrape' }] as any,
  };
}
