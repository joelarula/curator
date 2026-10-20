import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface YouTubeAudioMetadata {
    videoId: string;
    title: string;
    artist?: string;
    track?: string;
    album?: string;
    uploader: string;
    channel?: string;
    channelId?: string;
    uploadDate?: string;
    description?: string;
    durationSeconds: number;
    viewCount?: number;
    likeCount?: number;
    tags?: string[];
    thumbnail?: string;
    webpageUrl: string;
}

export interface YouTubeAudioOptions {
    /** Output directory (default: ./downloads/audio). */
    outDir?: string;
    /** Audio container/codec passed to yt-dlp --audio-format (default: mp3). */
    format?: 'mp3' | 'm4a' | 'wav' | 'opus' | 'flac' | 'aac' | 'vorbis';
    /** Embed audio tags, metadata and cover art into the sound file (default: true). */
    embedMetadata?: boolean;
    /** Also write a companion <filename>.info.json metadata file (default: false). */
    writeMetadataFile?: boolean;
    /**
     * Naming pattern for the output file without extension.
     * Presets:
     * - 'title-album-artist' (default): Title [- Album] - Artist
     * - 'artist-album-title': Artist [- Album] - Title
     * - 'title': Title only
     * - 'id': Video ID only
     * Or any custom yt-dlp template string (e.g. '%(title)s - %(artist)s').
     */
    namingPattern?: 'title-album-artist' | 'artist-album-title' | 'title' | 'id' | string;
    /** Custom yt-dlp filename template (alias for namingPattern). */
    filenameTemplate?: string;
    /** Restrict filenames to ASCII only and replace spaces with underscores (default: false). */
    restrictFilenames?: boolean;
    /** yt-dlp binary name or path (default: yt-dlp). */
    ytDlpPath?: string;
    /** Abort timeout in ms (default: 5 minutes). */
    timeoutMs?: number;
}

export interface YouTubeAudioResult extends YouTubeAudioMetadata {
    filePath: string;
    format: string;
}

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

const METADATA_PRINT_FORMAT = '%(.{id,title,artist,track,album,uploader,channel,channel_id,upload_date,description,duration,view_count,like_count,tags,thumbnail,webpage_url})j';

interface RawYtDlpMeta {
    id: string;
    title?: string;
    artist?: string;
    track?: string;
    album?: string;
    uploader?: string;
    channel?: string;
    channel_id?: string;
    upload_date?: string;
    description?: string;
    duration?: number;
    view_count?: number;
    like_count?: number;
    tags?: string[];
    thumbnail?: string;
    webpage_url?: string;
}

function resolveOutputTemplate(pattern?: string): string {
    if (!pattern || pattern === 'title-album-artist') {
        return '%(track,title)s%(album& - |)s%(album|)s - %(artist,uploader)s.%(ext)s';
    }
    if (pattern === 'artist-album-title') {
        return '%(artist,uploader)s%(album& - |)s%(album|)s - %(track,title)s.%(ext)s';
    }
    if (pattern === 'title') {
        return '%(track,title)s.%(ext)s';
    }
    if (pattern === 'id') {
        return '%(id)s.%(ext)s';
    }
    return pattern.endsWith('.%(ext)s') ? pattern : `${pattern}.%(ext)s`;
}

function parseYtDlpMetadata(jsonLine: string, fallbackUrl: string): YouTubeAudioMetadata {
    const meta = JSON.parse(jsonLine) as RawYtDlpMeta;
    return {
        videoId: meta.id,
        title: meta.title ?? '',
        artist: meta.artist || undefined,
        track: meta.track || undefined,
        album: meta.album || undefined,
        uploader: meta.uploader ?? meta.channel ?? '',
        channel: meta.channel || undefined,
        channelId: meta.channel_id || undefined,
        uploadDate: meta.upload_date || undefined,
        description: meta.description || undefined,
        durationSeconds: meta.duration ?? 0,
        viewCount: meta.view_count || undefined,
        likeCount: meta.like_count || undefined,
        tags: Array.isArray(meta.tags) && meta.tags.length > 0 ? meta.tags : undefined,
        thumbnail: meta.thumbnail || undefined,
        webpageUrl: meta.webpage_url || fallbackUrl,
    };
}

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

    /** Extracts YouTube metadata without downloading the media payload. */
    static async fetchMetadata(
        url: string,
        options: { ytDlpPath?: string; timeoutMs?: number } = {},
    ): Promise<YouTubeAudioMetadata> {
        if (!this.isYouTubeUrl(url)) throw new Error(`Not a valid YouTube URL: "${url}"`);

        const bin = options.ytDlpPath ?? 'yt-dlp';
        const timeoutMs = options.timeoutMs ?? 60_000;

        const stdout = await run(
            bin,
            [
                '--no-playlist',
                '--js-runtimes', 'node',
                '--skip-download',
                '--print', METADATA_PRINT_FORMAT,
                '--', url,
            ],
            timeoutMs,
        );

        const jsonLine = stdout.split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith('{') && l.endsWith('}'));
        if (!jsonLine) throw new Error('yt-dlp returned no metadata');
        return parseYtDlpMetadata(jsonLine, url);
    }

    /** Downloads the audio track of a YouTube video as a sound file with rich metadata embedded. */
    static async downloadAudio(url: string, options: YouTubeAudioOptions = {}): Promise<YouTubeAudioResult> {
        if (!this.isYouTubeUrl(url)) throw new Error(`Not a valid YouTube URL: "${url}"`);

        const bin = options.ytDlpPath ?? 'yt-dlp';
        const format = options.format ?? 'mp3';
        const embedMetadata = options.embedMetadata !== false;
        const outDir = path.resolve(options.outDir ?? path.join('downloads', 'audio'));
        const timeoutMs = options.timeoutMs ?? 5 * 60_000;
        const template = resolveOutputTemplate(options.filenameTemplate ?? options.namingPattern);
        await mkdir(outDir, { recursive: true });

        const args = [
            '--no-playlist',
            '--js-runtimes', 'node',
            '--extract-audio',
            '--audio-format', format,
            '--audio-quality', '0',
            '--no-simulate',
        ];

        if (options.restrictFilenames) {
            args.push('--restrict-filenames');
        }

        if (embedMetadata) {
            args.push('--embed-metadata');
        }

        args.push(
            '--print', METADATA_PRINT_FORMAT,
            '--print', 'after_move:filepath',
            '-o', path.join(outDir, template),
            '--', url,
        );

        const stdout = await run(bin, args, timeoutMs);

        const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const jsonLine = lines.find(l => l.startsWith('{') && l.endsWith('}'));
        if (!jsonLine) throw new Error('yt-dlp returned no metadata');
        const metadata = parseYtDlpMetadata(jsonLine, url);

        const files = await readdir(outDir);
        let resolvedFilePath = lines.find(l => l !== jsonLine && (l.endsWith(`.${format}`) || path.isAbsolute(l)));
        if (resolvedFilePath && !path.isAbsolute(resolvedFilePath)) {
            resolvedFilePath = path.resolve(outDir, resolvedFilePath);
        }

        if (!resolvedFilePath || !files.includes(path.basename(resolvedFilePath))) {
            const matchingFile = files.find(f => f.endsWith(`.${format}`));
            if (!matchingFile) throw new Error(`Audio file not found in ${outDir}`);
            resolvedFilePath = path.join(outDir, matchingFile);
        }

        if (options.writeMetadataFile) {
            const parsedPath = path.parse(resolvedFilePath);
            const jsonPath = path.join(parsedPath.dir, `${parsedPath.name}.info.json`);
            await writeFile(jsonPath, JSON.stringify(metadata, null, 2), 'utf-8');
        }

        return {
            ...metadata,
            filePath: resolvedFilePath,
            format,
        };
    }
}
