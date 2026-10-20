import { ScraperService } from './ScraperService.js';
import { YouTubeAudioService, builtInPlugins } from './plugins/index.js';

export * from './ScraperService.js';
export * from './ScraperTask.js';
export * from './plugins/index.js';

for (const task of builtInPlugins) {
  if (!ScraperService.getTask(task.name)) ScraperService.registerTask(task);
}

export function scraperPlugin() {
  return {
    name: 'scraper',
    version: '1.0.0',
    description: 'Curator HTML to Markdown scraper with pluggable prepared tasks',
    service: ScraperService,
    extractFromUrl: ScraperService.extractFromUrl.bind(ScraperService),
    extractFromHtml: ScraperService.extractFromHtml.bind(ScraperService),
    extractLinksFromUrl: ScraperService.extractLinksFromUrl.bind(ScraperService),
    extractLinksFromHtml: ScraperService.extractLinksFromHtml.bind(ScraperService),
    extractBySelectors: ScraperService.extractBySelectors.bind(ScraperService),
    registerTask: ScraperService.registerTask.bind(ScraperService),
    listTasks: ScraperService.listTasks.bind(ScraperService),
    runTask: ScraperService.runTask.bind(ScraperService),
    findTaskForUrl: ScraperService.findTaskForUrl.bind(ScraperService),
    downloadYouTubeAudio: YouTubeAudioService.downloadAudio.bind(YouTubeAudioService),
    fetchYouTubeMetadata: YouTubeAudioService.fetchMetadata.bind(YouTubeAudioService),
  };
}

export default scraperPlugin;
