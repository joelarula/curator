import type { ScraperTask } from '../ScraperTask.js';
import { youtubeAudioTask } from './youtubeAudioTask.js';

export * from './YouTubeAudioService.js';
export * from './youtubeAudioTask.js';

/** Add new prepared-task plugins here to have them registered on load. */
export const builtInPlugins: ScraperTask[] = [youtubeAudioTask];
