import { ScraperService, type ScrapeResult } from './ScraperService.js';

export * from './ScraperService.js';

export function scraperPlugin() {
  return {
    name: 'scraper',
    version: '1.0.0',
    description: 'Curator HTML to Markdown scraper and link extraction plugin',
    service: ScraperService,
    extractFromUrl: ScraperService.extractFromUrl.bind(ScraperService),
    extractFromHtml: ScraperService.extractFromHtml.bind(ScraperService),
    extractLinksFromUrl: ScraperService.extractLinksFromUrl.bind(ScraperService),
    extractLinksFromHtml: ScraperService.extractLinksFromHtml.bind(ScraperService),
    extractBySelectors: ScraperService.extractBySelectors.bind(ScraperService),
  };
}

export default scraperPlugin;
