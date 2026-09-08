import { ErrClient } from '../err-client.js';
import { scrape } from '../scrape.js';
import { parseMusicList, parseEpisodeText } from '../episode-parser.js';
import { saveProgramData } from '../db.js';

export function createProgramScrapeAST({ seriesContentId, programTitle, limit = 50 }) {
  return {
    type: 'Sequence',
    steps: [
      {
        type: 'ToolTask',
        tool: 'vikerraadio_discover_episodes',
        args: { seriesContentId: String(seriesContentId), limit },
        as: 'discovery',
      },
      {
        type: 'ForEach',
        collection: '{{discovery.data}}',
        iterator: 'episode',
        body: {
          type: 'ToolTask',
          tool: 'vikerraadio_process_episode',
          args: {
            url: '{{episode.url}}',
            episode: '{{episode}}',
            program: { seriesId: String(seriesContentId), title: programTitle },
          },
        },
      },
    ],
  };
}

export function createErrRadioPlugin(db) {
  const client = new ErrClient();

  return {
    name: 'err-radio',
    tools: {
      vikerraadio_discover_episodes: {
        name: 'vikerraadio_discover_episodes',
        description: 'Discover available episodes from Vikerraadio/ERR archive API for any series content ID.',
        parameters: {
          type: 'object',
          properties: {
            seriesContentId: { type: 'string' },
            limit: { type: 'number' },
            cursor: { type: 'string' },
          },
        },
        async runAsync({ args } = {}) {
          const seriesContentId = args?.seriesContentId ?? '1037846';
          const response = await client.archive({ seriesContentId, limit: args?.limit ?? 50, cursor: args?.cursor });
          return response;
        },
        toGenAiDeclaration() {
          return { name: this.name, description: this.description, parameters: this.parameters };
        },
      },
      vikerraadio_fetch_episode_page: {
        name: 'vikerraadio_fetch_episode_page',
        description: 'Fetch the raw HTML content of a Vikerraadio episode page URL.',
        parameters: {
          type: 'object',
          properties: { url: { type: 'string' } },
          required: ['url'],
        },
        async runAsync({ args } = {}) {
          if (!args?.url) throw new Error('url parameter is required');
          const html = await client.episode(args.url);
          return { url: args.url, html };
        },
        toGenAiDeclaration() {
          return { name: this.name, description: this.description, parameters: this.parameters };
        },
      },
      vikerraadio_parse_music_list: {
        name: 'vikerraadio_parse_music_list',
        description: 'Parse music list rows (artists and titles) from episode page HTML.',
        parameters: {
          type: 'object',
          properties: { html: { type: 'string' } },
          required: ['html'],
        },
        async runAsync({ args } = {}) {
          const tracks = parseMusicList(args?.html ?? '');
          return { tracks, count: tracks.length };
        },
        toGenAiDeclaration() {
          return { name: this.name, description: this.description, parameters: this.parameters };
        },
      },
      vikerraadio_parse_episode_text: {
        name: 'vikerraadio_parse_episode_text',
        description: 'Parse accompanying show text, descriptions, and full text notes from episode HTML.',
        parameters: {
          type: 'object',
          properties: { html: { type: 'string' } },
          required: ['html'],
        },
        async runAsync({ args } = {}) {
          const metadata = parseEpisodeText(args?.html ?? '');
          return metadata;
        },
        toGenAiDeclaration() {
          return { name: this.name, description: this.description, parameters: this.parameters };
        },
      },
      vikerraadio_store_program_data: {
        name: 'vikerraadio_store_program_data',
        description: 'Persist program, episode details, music tracks, and textual metadata into database.',
        parameters: {
          type: 'object',
          properties: {
            program: { type: 'object' },
            episode: { type: 'object' },
            tracks: { type: 'array' },
            metadata: { type: 'object' },
          },
          required: ['episode'],
        },
        async runAsync({ args } = {}) {
          if (!args?.episode) throw new Error('episode parameter is required');
          saveProgramData(db, {
            program: args.program ?? { seriesId: '1037846', title: 'Vikerraadio' },
            episode: args.episode,
            tracks: args.tracks ?? [],
            metadata: args.metadata ?? {},
          });
          return { stored: true, episodeId: args.episode.id };
        },
        toGenAiDeclaration() {
          return { name: this.name, description: this.description, parameters: this.parameters };
        },
      },
      vikerraadio_process_episode: {
        name: 'vikerraadio_process_episode',
        description: 'Fetch, parse, and persist a single episode into the database in one fault-isolated step.',
        parameters: {
          type: 'object',
          properties: {
            episode: { type: 'object' },
            program: { type: 'object' },
            url: { type: 'string' },
          },
          required: ['url'],
        },
        async runAsync({ args } = {}) {
          const url = args?.url || args?.episode?.url;
          if (!url) throw new Error('url parameter is required');
          const html = await client.episode(url);
          const tracks = parseMusicList(html);
          const metadata = parseEpisodeText(html);

          const epData = args?.episode || {
            id: Date.now(),
            url,
            title: metadata?.description ? metadata.description.slice(0, 100) : url,
          };

          saveProgramData(db, {
            program: args?.program ?? { seriesId: '1037846', title: 'Vikerraadio' },
            episode: epData,
            tracks,
            metadata,
          });

          return {
            stored: true,
            episodeId: epData.id,
            tracksSaved: tracks.length,
            hasMetadata: Boolean(metadata?.description),
          };
        },
        toGenAiDeclaration() {
          return { name: this.name, description: this.description, parameters: this.parameters };
        },
      },
      vikerraadio_download_episode: {
        name: 'vikerraadio_download_episode',
        description: 'Download the high-quality audio file (.m4a / .mp3) for any Vikerraadio/ERR episode into disk storage.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            outputDir: { type: 'string' },
            fileName: { type: 'string' },
          },
          required: ['url'],
        },
        async runAsync({ args } = {}) {
          const inputUrl = args?.url;
          if (!inputUrl) throw new Error('url parameter is required');

          const pageUrl = inputUrl.startsWith('http') ? inputUrl : `https://vikerraadio.err.ee/${inputUrl}`;
          const html = await client.episode(pageUrl);
          
          // Unescape backslashes in HTML JSON
          const cleanHtml = html.replace(/\\"/g, '"').replace(/\\\//g, '/');

          // Extract direct .m4a / .mp3 audio file or .m3u8 stream
          let audioUrl = null;
          const fileMatch = cleanHtml.match(/"file"\s*:\s*"(\/\/[^"]+\.(m4a|mp3))"/i)
            || cleanHtml.match(/https?:\/\/[^"'\s]*vod\.err\.ee[^"'\s]*\.(m4a|mp3)/i);
          if (fileMatch) {
            const raw = fileMatch[1] || fileMatch[0];
            audioUrl = raw.startsWith('http') ? raw : `https:${raw}`;
          }

          if (!audioUrl) {
            const hlsMatch = cleanHtml.match(/"hls"\s*:\s*"(\/\/[^"]+\.m3u8)"/i)
              || cleanHtml.match(/https?:\/\/[^"'\s]*vod\.err\.ee[^"'\s]*\.m3u8/i);
            if (hlsMatch) {
              const raw = hlsMatch[1] || hlsMatch[0];
              audioUrl = raw.startsWith('http') ? raw : `https:${raw}`;
            }
          }

          if (!audioUrl) {
            throw new Error(`No downloadable audio file found on episode page: ${pageUrl}`);
          }

          const { createWriteStream, mkdirSync } = await import('node:fs');
          const { join } = await import('node:path');
          const { pipeline } = await import('node:stream/promises');

          const outDir = args?.outputDir ?? 'data/downloads';
          mkdirSync(outDir, { recursive: true });

          const idMatch = pageUrl.match(/\/(\d+)/);
          const epId = idMatch ? idMatch[1] : Date.now();
          const ext = audioUrl.includes('.mp3') ? 'mp3' : (audioUrl.includes('.m3u8') ? 'm3u8' : 'm4a');
          const name = args?.fileName || `episode_${epId}.${ext}`;
          const destPath = join(outDir, name);

          const response = await fetch(audioUrl);
          if (!response.ok || !response.body) {
            throw new Error(`Failed to stream audio from ${audioUrl} (HTTP ${response.status})`);
          }

          const fileStream = createWriteStream(destPath);
          await pipeline(response.body, fileStream);

          const contentLength = response.headers.get('content-length');
          const fileSizeMB = contentLength ? (Number(contentLength) / (1024 * 1024)).toFixed(2) : 'unknown';

          return {
            downloaded: true,
            episodeUrl: pageUrl,
            audioUrl,
            filePath: destPath,
            fileName: name,
            fileSizeMB: `${fileSizeMB} MB`,
          };
        },
        toGenAiDeclaration() {
          return { name: this.name, description: this.description, parameters: this.parameters };
        },
      },
      vikerraadio_scrape: {
        name: 'vikerraadio_scrape',
        description: 'Discover and index episodes for any Vikerraadio program into the database.',
        parameters: {
          type: 'object',
          properties: {
            seriesContentId: { type: 'string' },
            programTitle: { type: 'string' },
            refresh: { type: 'boolean' },
          },
        },
        async runAsync({ args } = {}) {
          const seriesId = args?.seriesContentId ?? '1037846';
          const title = args?.programTitle ?? (seriesId === '1037846' ? 'Kauamängiv' : 'Vikerraadio Saade');
          const result = await scrape({ client, db, seriesContentId: seriesId, programTitle: title, refresh: args?.refresh === true });
          return result;
        },
        toGenAiDeclaration() {
          return { name: this.name, description: this.description, parameters: this.parameters };
        },
      },
      keeris_scrape: {
        name: 'keeris_scrape',
        description: 'Convenience wrapper for scraping Kauamangiv (series ID 1037846).',
        parameters: { type: 'object', properties: { refresh: { type: 'boolean' } } },
        async runAsync({ args } = {}) {
          const result = await scrape({ client, db, seriesContentId: '1037846', programTitle: 'Kauamängiv', refresh: args?.refresh === true });
          return result;
        },
        toGenAiDeclaration() {
          return { name: 'keeris_scrape', description: this.description, parameters: this.parameters };
        },
      },
    },
    scripts: {
      'err-radio.archive': async () => client.archive(),
    },
  };
}