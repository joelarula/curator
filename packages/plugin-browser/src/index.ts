import { BrowserService } from './BrowserService.js';

export * from './BrowserService.js';

export function browserPlugin() {
  return {
    name: 'browser',
    version: '1.0.0',
    description: 'Curator Playwright browser automation and CDP relay plugin',
    service: BrowserService,
    run: BrowserService.run.bind(BrowserService),
    shutdown: BrowserService.shutdown.bind(BrowserService),
  };
}

export default browserPlugin;
