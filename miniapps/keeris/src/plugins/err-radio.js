import { ErrClient } from '../err-client.js';
import { scrape } from '../scrape.js';
import { parseMusicList, parseEpisodeText } from '../episode-parser.js';
import { saveProgramData } from '../db.js';

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
        description: 'Persist program, episode details, music tracks, and textual metadata into SQLite database.',
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