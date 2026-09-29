import { ErrClient, type ErrArchiveBroadcast } from '../err-client.ts';
import { scrape } from '../scrape.ts';
import { parseMusicList, parseEpisodeText, parseEpisodeDate } from '../episode-parser.ts';
import { saveProgramData } from '../db.ts';

export {
  createProgramScrapeAST,
  type CreateProgramScrapeASTOptions,
} from './manifest.ts';

export function createErrRadioPlugin(db: any) {
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
            onlyNew: { type: 'boolean' },
            refresh: { type: 'boolean' },
          },
        },
        async runAsync({ args }: { args?: any } = {}) {
          const seriesContentId = args?.seriesContentId ?? '1037846';
          const response = await client.archive({ seriesContentId, limit: args?.limit ?? 50, cursor: args?.cursor });
          
          // By default, filter out episodes that have already been parsed with tracks into the database
          if (args?.refresh !== true && args?.onlyNew !== false && response?.data && Array.isArray(response.data)) {
            const newEpisodes: any[] = [];
            for (const ep of response.data) {
              const idMatch = ep.url ? String(ep.url).match(/\/(\d+)/) : null;
              const epId = ep.id ?? (idMatch ? Number(idMatch[1]) : null);
              if (epId) {
                try {
                  const existing: any = await db.prepare(`
                    SELECT e.id, e.parse_status, COUNT(t.id) as track_count
                    FROM episodes e
                    LEFT JOIN tracks t ON t.episode_id = e.id
                    WHERE e.id = ? OR e.url = ?
                    GROUP BY e.id
                  `).get(epId, ep.url || '');
                  if (existing && existing.parse_status === 'parsed' && Number(existing.track_count || 0) > 0) {
                    continue; // Skip already indexed episode that genuinely has tracks
                  }
                } catch (_) {}
              }
              newEpisodes.push(ep);
            }
            return {
              ...response,
              data: newEpisodes,
              totalDiscovered: response.data.length,
              newEpisodesCount: newEpisodes.length,
            };
          }

          return response;
        },
        toGenAiDeclaration() {
          return { name: this.name, description: this.description, parameters: this.parameters };
        },
      },
      vikerraadio_discover_missing_episodes: {
        name: 'vikerraadio_discover_missing_episodes',
        description: 'Discover episodes in the database that currently have 0 tracks or failed parsing so they can be re-scraped.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
            programId: { type: 'string' },
            seriesContentId: { type: 'string' },
          },
        },
        async runAsync({ args }: { args?: any } = {}) {
          const limit = Number(args?.limit || 50);
          let sql = `
            SELECT e.id, e.url, e.title, e.scheduled_at as scheduledAt, e.published_at as publishedAt,
                   p.id as programId, p.title as programTitle, p.series_id as seriesId,
                   COUNT(t.id) as track_count
            FROM episodes e
            LEFT JOIN tracks t ON t.episode_id = e.id
            LEFT JOIN programs p ON p.id = e.program_id
            WHERE 1=1
          `;
          const params: any[] = [];
          if (args?.programId) {
            sql += ` AND (p.id = ? OR p.series_id = ?)`;
            params.push(args.programId, args.programId);
          }
          if (args?.seriesContentId) {
            sql += ` AND p.series_id = ?`;
            params.push(args.seriesContentId);
          }
          sql += `
            GROUP BY e.id
            HAVING track_count = 0
            ORDER BY e.scheduled_at DESC
          `;
          if (limit > 0) {
            sql += ` LIMIT ${limit}`;
          }
          const rows = await db.prepare(sql).all(...params);
          const formatted = (rows || []).map((r: any) => ({
            id: r.id,
            url: r.url,
            heading: r.title,
            title: r.title,
            scheduledAt: r.scheduledAt,
            publishedAt: r.publishedAt,
            seriesId: r.seriesId || '1037846',
            programTitle: r.programTitle || 'Vikerraadio',
          }));
          return {
            data: formatted,
            totalDiscovered: formatted.length,
          };
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
        async runAsync({ args }: { args?: any } = {}) {
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
        async runAsync({ args }: { args?: any } = {}) {
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
        async runAsync({ args }: { args?: any } = {}) {
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
        async runAsync({ args }: { args?: any } = {}) {
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
            refresh: { type: 'boolean' },
          },
          required: ['url'],
        },
        async runAsync({ args }: { args?: any } = {}) {
          const url = args?.url || args?.episode?.url;
          if (!url) throw new Error('url parameter is required');

          const idMatch = url.match(/\/(\d+)/);
          const episodeId = args?.episode?.id || (idMatch ? Number(idMatch[1]) : null);

          // Skip re-fetching and parsing if already saved with tracks in database and refresh is false
          if (!args?.refresh && episodeId) {
            try {
              const existing: any = await db.prepare(`
                SELECT e.id, e.parse_status, COUNT(t.id) as track_count
                FROM episodes e
                LEFT JOIN tracks t ON t.episode_id = e.id
                WHERE e.id = ? OR e.url = ?
                GROUP BY e.id
              `).get(episodeId, url);
              if (existing && existing.parse_status === 'parsed' && Number(existing.track_count || 0) > 0) {
                return {
                  stored: false,
                  skipped: true,
                  reason: 'already_parsed_with_tracks',
                  episodeId: existing.id,
                  parseStatus: existing.parse_status,
                  trackCount: existing.track_count,
                };
              }
            } catch (_) {}
          }

          const html = await client.episode(url);
          const tracks = parseMusicList(html);
          const metadata = parseEpisodeText(html);
          const parsedDate = parseEpisodeDate(html);

          const scheduledAt = args?.episode?.scheduledAt
            || (args?.episode?.scheduleStart ? new Date(args.episode.scheduleStart * 1000).toISOString() : null)
            || parsedDate;
          const publishedAt = args?.episode?.publishedAt
            || (args?.episode?.publicStart ? new Date(args.episode.publicStart * 1000).toISOString() : null)
            || parsedDate;

          const epData = {
            ...args?.episode,
            id: episodeId || Date.now(),
            url,
            title: args?.episode?.heading || args?.episode?.title || (metadata?.description ? metadata.description.slice(0, 100) : url),
            scheduledAt,
            publishedAt,
          };

          saveProgramData(db, {
            program: args?.program ?? { seriesId: '1037846', title: 'Vikerraadio' },
            episode: epData,
            tracks,
            metadata,
            status: tracks.length > 0 ? 'parsed' : 'no_tracks',
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
        async runAsync({ args }: { args?: any } = {}) {
          const inputUrl = args?.url;
          if (!inputUrl) throw new Error('url parameter is required');

          const pageUrl = inputUrl.startsWith('http') ? inputUrl : `https://vikerraadio.err.ee/${inputUrl}`;
          const html = await client.episode(pageUrl);
          
          // Unescape backslashes in HTML JSON
          const cleanHtml = html.replace(/\\"/g, '"').replace(/\\\//g, '/');

          // Extract direct .m4a / .mp3 audio file or .m3u8 stream
          let audioUrl: string | null = null;
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
          await pipeline(response.body as any, fileStream);

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
        async runAsync({ args }: { args?: any } = {}) {
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
        async runAsync({ args }: { args?: any } = {}) {
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
