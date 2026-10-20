import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

export interface YouTubeAudioOptions {
    /** Output directory (default: ./downloads/audio). */
    outDir?: string;
    /** Audio container/codec passed to yt-dlp --audio-format (default: mp3). */
    format?: 'mp3' | 'm4a' | 'wav' | 'opus' | 'flac' | 'aac' | 'vorbis';
    /** yt-dlp binary name or path (default: yt-dlp). */
    ytDlpPath?: string;
    /** Abort timeout in ms (default: 5 minutes). */
    timeoutMs?: number;
}

export interface YouTubeAudioResult {
    videoId: string;
    title: string;
    uploader: string;
    durationSeconds: number;
    filePath: string;
    format: string;
}

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

function run(bin: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { windowsHide: true, timeout: timeoutMs });
        let out = '';
        let err = '';
        child.stdout.on('data', d => (out += d));
        child.stderr.on('data', d => (err += d));
        child.on('error', e =>
            reject(new Error(`Failed to run "${bin}": ${e.message}. Install yt-dlp (and ffmpeg) and ensure it is on PATH.`)),
        );
        child.on('close', code =>
            code === 0 ? resolve(out) : reject(new Error(`yt-dlp exited with ${code}: ${err.trim().slice(-500)}`)),
        );
    });
}

export class YouTubeAudioService {
    static isYouTubeUrl(url: string): boolean {
        try {
            const u = new URL(url);
            return (u.protocol === 'https:' || u.protocol === 'http:') && YT_HOSTS.has(u.hostname.toLowerCase());
        } catch {
            return false;
        }
    }

    /** Downloads the audio track of a YouTube video as a sound file (requires yt-dlp and ffmpeg). */
    static async downloadAudio(url: string, options: YouTubeAudioOptions = {}): Promise<YouTubeAudioResult> {
        if (!this.isYouTubeUrl(url)) throw new Error(`Not a valid YouTube URL: "${url}"`);

        const bin = options.ytDlpPath ?? 'yt-dlp';
        const format = options.format ?? 'mp3';
        const outDir = path.resolve(options.outDir ?? path.join('downloads', 'audio'));
        const timeoutMs = options.timeoutMs ?? 5 * 60_000;
        await mkdir(outDir, { recursive: true });

        const stdout = await run(
            bin,
            [
                '--no-playlist',
                '--extract-audio',
                '--audio-format', format,
                '--audio-quality', '0',
                '--restrict-filenames',
                '--no-simulate',
                '--print', '%(.{id,title,uploader,duration})j',
                '-o', path.join(outDir, '%(id)s.%(ext)s'),
                '--', url,
            ],
            timeoutMs,
        );

        const jsonLine = stdout.split(/\r?\n/).reverse().find(l => l.trim().startsWith('{'));
        if (!jsonLine) throw new Error('yt-dlp returned no metadata');
        const meta = JSON.parse(jsonLine) as { id: string; title?: string; uploader?: string; duration?: number };

        const files = await readdir(outDir);
        const file = files.find(f => f.startsWith(`${meta.id}.`) && f.endsWith(`.${format}`));
        if (!file) throw new Error(`Audio file for ${meta.id} not found in ${outDir}`);

        return {
            videoId: meta.id,
            title: meta.title ?? '',
            uploader: meta.uploader ?? '',
            durationSeconds: meta.duration ?? 0,
            filePath: path.join(outDir, file),
            format,
        };
    }
}
