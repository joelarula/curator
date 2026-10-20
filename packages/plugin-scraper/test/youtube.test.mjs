import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ScraperService, YouTubeAudioService } from '../dist/index.js';

const URL = 'https://www.youtube.com/watch?v=BXf1j8Hz2bU';
const VIDEO_ID = 'BXf1j8Hz2bU';

const hasBinary = bin => !spawnSync(bin, ['--version'], { windowsHide: true }).error;
const canDownload = hasBinary('yt-dlp') && hasBinary('ffmpeg');

test('isYouTubeUrl accepts the target url and rejects others', () => {
  assert.equal(YouTubeAudioService.isYouTubeUrl(URL), true);
  assert.equal(YouTubeAudioService.isYouTubeUrl('https://youtu.be/BXf1j8Hz2bU'), true);
  assert.equal(YouTubeAudioService.isYouTubeUrl('https://example.com/watch?v=BXf1j8Hz2bU'), false);
  assert.equal(YouTubeAudioService.isYouTubeUrl('not a url'), false);
});

test('youtube-audio task is registered and matches the url', () => {
  assert.ok(ScraperService.listTasks().some(t => t.name === 'youtube-audio'));
  assert.equal(ScraperService.findTaskForUrl(URL)?.name, 'youtube-audio');
});

test('downloadAudio rejects non-YouTube urls', async () => {
  await assert.rejects(() => YouTubeAudioService.downloadAudio('https://example.com'), /Not a valid YouTube URL/);
});

test('runTask downloads the audio as an mp3 file', { skip: !canDownload && 'yt-dlp and ffmpeg are required', timeout: 5 * 60_000 }, async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'yt-audio-'));
  try {
    const result = await ScraperService.runTask('youtube-audio', { url: URL, outDir, format: 'mp3' });
    assert.equal(result.videoId, VIDEO_ID);
    assert.equal(result.format, 'mp3');
    assert.ok(result.durationSeconds > 0);
    assert.ok(result.filePath.endsWith(`${VIDEO_ID}.mp3`));
    assert.ok((await stat(result.filePath)).size > 0);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
