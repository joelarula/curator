import type { ScraperTask } from '../ScraperTask.js';
import { YouTubeAudioService, type YouTubeAudioOptions, type YouTubeAudioResult } from './YouTubeAudioService.js';

export interface YouTubeAudioTaskInput extends YouTubeAudioOptions {
    url: string;
}

export const youtubeAudioTask: ScraperTask<YouTubeAudioTaskInput, YouTubeAudioResult> = {
    name: 'youtube-audio',
    description: 'Download the audio track of a YouTube video as a sound file (requires yt-dlp and ffmpeg).',
    matches: url => YouTubeAudioService.isYouTubeUrl(url),
    run: ({ url, ...options }) => YouTubeAudioService.downloadAudio(url, options),
};
