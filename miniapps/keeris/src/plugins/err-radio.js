import { ErrClient } from '../err-client.js';
import { scrape } from '../scrape.js';
import { existsSync } from 'node:fs';
import { importLegacyJson } from '../import-legacy.js';
import { createCuratorStore } from '../curator-store.js';

export function createErrRadioPlugin(db) {
  return {
  name: 'err-radio',
  tools: {
    keeris_scrape: {
      name: 'keeris_scrape',
      description: 'Discover and index new Kauamangiv episodes from ERR into the Keeris database.',
      parameters: { type: 'object', properties: { refresh: { type: 'boolean' } } },
      async runAsync({ args, toolContext }) {
        const curatorStore = await createCuratorStore(toolContext?.prisma, await import('@curator/agent-server').then(({ curatorEngine }) => curatorEngine));
        const result = await scrape({ client: new ErrClient(), db, refresh: args?.refresh === true, onEpisode: curatorStore?.saveEpisode });
        return result;
      },
      toGenAiDeclaration() {
        return { name: 'keeris_scrape', description: this.description, parameters: this.parameters };
      },
    },
    keeris_migrate_legacy: {
      name: 'keeris_migrate_legacy',
      description: 'Import the legacy Keeris track snapshot into the current SQLite read model once.',
      parameters: { type: 'object', properties: { input: { type: 'string' } } },
      async runAsync({ args, toolContext }) {
        const input = args?.input ?? process.env.LEGACY_IMPORT_PATH ?? 'web/public/tracks.json';
        if (!existsSync(input)) throw new Error(`Legacy import file not found: ${input}`);
        const curatorStore = await createCuratorStore(toolContext?.prisma, await import('@curator/agent-server').then(({ curatorEngine }) => curatorEngine));
        return importLegacyJson(input, db, { onEpisode: curatorStore?.saveEpisode });
      },
      toGenAiDeclaration() {
        return { name: this.name, description: this.description, parameters: this.parameters };
      },
    },
    keeris_verify_migration: {
      name: 'keeris_verify_migration',
      description: 'Verify migrated ERR episodes and tracks exist in Curator semantic shapes.',
      parameters: { type: 'object', properties: { sampleEpisodeId: { type: 'number' } } },
      async runAsync({ args, toolContext }) {
        const curatorStore = await createCuratorStore(toolContext?.prisma, await import('@curator/agent-server').then(({ curatorEngine }) => curatorEngine));
        if (!curatorStore) throw new Error('Curator database is required for migration verification');
        return curatorStore.verify({ sampleEpisodeId: args?.sampleEpisodeId });
      },
      toGenAiDeclaration() {
        return { name: this.name, description: this.description, parameters: this.parameters };
      },
    },
  },
  scripts: {
    'err-radio.archive': async () => new ErrClient().archive(),
  },
  };
};