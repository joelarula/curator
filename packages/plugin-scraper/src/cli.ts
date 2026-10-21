#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
    .name('curator-scraper')
    .description('Curator Audio & Web Scraper CLI - Extract web markdown and download YouTube audio named after Title [- Album] - Artist')
    .version('1.0.0');

function displayMetadata(meta: any) {
    const mins = Math.floor(meta.durationSeconds / 60);
    const secs = String(Math.floor(meta.durationSeconds % 60)).padStart(2, '0');
    console.log(`Extracted Metadata:`);
    console.log(`  • Title:     ${meta.title || '(unknown)'}`);
    console.log(`  • Artist:    ${meta.artist || '(unknown)'}`);
    console.log(`  • Album:     ${meta.album || '(none)'}`);
    console.log(`  • Uploader:  ${meta.uploader || '(unknown)'}`);
    if (meta.channel && meta.channel !== meta.uploader) console.log(`  • Channel:   ${meta.channel}`);
    if (meta.uploadDate) console.log(`  • Date:      ${meta.uploadDate}`);
    console.log(`  • Duration:  ${mins}:${secs} (${meta.durationSeconds}s)`);
    if (meta.viewCount) console.log(`  • Views:     ${meta.viewCount.toLocaleString()}`);
    if (meta.thumbnail) console.log(`  • Thumbnail: ${meta.thumbnail}`);
}

program
    .command('youtube <url>', { isDefault: true })
    .alias('yt')
    .description('Download audio from a YouTube video (default naming: Title [- Album] - Artist)')
    .option('-o, --out <dir>', 'Output directory', './downloads/audio')
    .option('-f, --format <format>', 'Audio format: mp3, m4a, wav, opus, flac, aac', 'mp3')
    .option('-t, --template <pattern>', 'Filename pattern: title-album-artist, artist-album-title, title, id, or custom template', 'title-album-artist')
    .option('--title <title>', 'Override song/track title')
    .option('--album <album>', 'Override album name')
    .option('--artist <artist>', 'Override artist name')
    .option('-m, --metadata-only', 'Fetch and display metadata only (skip audio download)', false)
    .option('-i, --info-json', 'Write companion <filename>.info.json metadata file', false)
    .option('-j, --json', 'Output result as JSON', false)
    .option('--no-embed-metadata', 'Disable embedding ID3 tags and cover art')
    .option('--restrict-filenames', 'Restrict filenames to ASCII only', false)
    .action(async (url: string, opts: any) => {
        try {
            const ext = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
            const { YouTubeAudioService } = await import(`./plugins/YouTubeAudioService${ext}`);

            if (!YouTubeAudioService.isYouTubeUrl(url)) {
                console.error(`Error: "${url}" is not a valid YouTube URL.`);
                process.exit(1);
            }

            if (opts.metadataOnly) {
                if (!opts.json) {
                    console.log(`\n🎵 Curator YouTube Metadata Extractor`);
                    console.log(`─────────────────────────────────────────────────────────────`);
                    console.log(`Fetching metadata for: ${url}...\n`);
                }
                const meta = await YouTubeAudioService.fetchMetadata(url);
                if (opts.title) meta.title = opts.title;
                if (opts.album) meta.album = opts.album;
                if (opts.artist) meta.artist = opts.artist;

                if (opts.json) {
                    console.log(JSON.stringify(meta, null, 2));
                } else {
                    displayMetadata(meta);
                    console.log(`─────────────────────────────────────────────────────────────\n`);
                }
                return;
            }

            if (!opts.json) {
                console.log(`\n🎵 Curator YouTube Audio Scraper`);
                console.log(`─────────────────────────────────────────────────────────────`);
                console.log(`URL:       ${url}`);
                console.log(`Format:    ${opts.format} (embedded ID3 tags & cover art)`);
                console.log(`Naming:    ${opts.template}`);
                console.log(`Directory: ${opts.out}`);
                console.log(`─────────────────────────────────────────────────────────────`);
                console.log(`⏳ Downloading audio and extracting metadata...\n`);
            }

            const result = await YouTubeAudioService.downloadAudio(url, {
                outDir: opts.out,
                format: opts.format,
                namingPattern: opts.template,
                title: opts.title,
                album: opts.album,
                artist: opts.artist,
                embedMetadata: opts.embedMetadata,
                writeMetadataFile: opts.infoJson,
                restrictFilenames: opts.restrictFilenames,
            });

            if (opts.json) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                displayMetadata(result);
                console.log(`\n✅ Successfully downloaded audio:`);
                console.log(`   File:   ${result.filePath}`);
                console.log(`   Format: ${result.format}`);
                if (opts.infoJson) {
                    const parsed = result.filePath.replace(new RegExp(`\\.${result.format}$`), '.info.json');
                    console.log(`   Info:   ${parsed}`);
                }
                console.log(`─────────────────────────────────────────────────────────────\n`);
            }
        } catch (err: any) {
            console.error(`\n❌ Error: ${err.message}\n`);
            process.exit(1);
        }
    });

program
    .command('web <url>')
    .description('Scrape web page and convert to clean Markdown')
    .option('-s, --selector <selector>', 'CSS selector to extract')
    .action(async (url: string, opts: any) => {
        try {
            const ext = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
            const { ScraperService } = await import(`./ScraperService${ext}`);
            const res = await ScraperService.extractFromUrl(url, opts.selector);
            console.log(res.content);
        } catch (err: any) {
            console.error(`\n❌ Error: ${err.message}\n`);
            process.exit(1);
        }
    });

program.parse(process.argv);
