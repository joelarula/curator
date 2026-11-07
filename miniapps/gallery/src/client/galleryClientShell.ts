import {
  createClientShell,
  type ClientShell,
  type CuratorChannel,
  type ReplCommand,
  type ShellContext,
  type ClientShellConfig,
} from '@curator/host/client';
import { GalleryTool } from '../models/index.ts';

export const GALLERY_COMMANDS: ReplCommand[] = [
  {
    name: 'search',
    usage: '<query...>',
    aliases: ['find', 's'],
    description: 'Search paintings by title, author, or category (tool: gallery_search_items)',
    execute: async (rawArgs, tokens, ctx: ShellContext) => {
      const query = (tokens.join(' ') || rawArgs || '').trim();
      const channel: any = ctx.channel;
      const res =
        typeof channel?.runTool === 'function'
          ? await channel.runTool(GalleryTool.SEARCH_ITEMS, {
              search: query || undefined,
              publishedOnly: false,
              limit: 20,
            })
          : await channel?.send('curator:tool_call', {
              tool: GalleryTool.SEARCH_ITEMS,
              args: { search: query || undefined, publishedOnly: false, limit: 20 },
            });
      const items = res?.result?.items || res?.items || [];
      console.log(`\n=== Gallery Artworks (${items.length}) ===`);
      for (const it of items) {
        console.log(
          `[${it.key}] ${it.name} — ${it.authorName} (${(it.categoryKeys || []).join(', ')}) [${it.published ? 'PUBLISHED' : 'DRAFT'}]`
        );
      }
      console.log('');
    },
  },
  {
    name: 'stats',
    description: 'Display gallery statistics (tool: gallery_get_stats)',
    execute: async (_rawArgs, _tokens, ctx: ShellContext) => {
      const channel: any = ctx.channel;
      const res =
        typeof channel?.runTool === 'function'
          ? await channel.runTool(GalleryTool.GET_STATS, {})
          : await channel?.send('curator:tool_call', {
              tool: GalleryTool.GET_STATS,
              args: {},
            });
      const stats = res?.result || res;
      console.log('\n=== Gallery Statistics ===');
      console.log(`Project:         ${stats?.projectId || 'artmoments'}`);
      console.log(`Total Artworks:  ${stats?.totalItems ?? 0}`);
      console.log(`Published:       ${stats?.publishedItems ?? 0}`);
      console.log(`Categories:      ${stats?.totalCategories ?? 0}`);
      console.log(`Authors:         ${stats?.totalAuthors ?? 0}`);
      console.log(`Attachments:     ${stats?.totalAttachments ?? 0}\n`);
    },
  },
  {
    name: 'migrate',
    usage: '[sourceDir]',
    description: 'Migrate ArtMoments (Z:\\artm2) data into Curator Gallery',
    execute: async (rawArgs, tokens, ctx: ShellContext) => {
      const sourceDir = (tokens[0] || rawArgs || 'Z:\\artm2\\gallery\\data\\db').trim();
      const channel: any = ctx.channel;
      console.log(`Migrating from ${sourceDir}...`);
      const res =
        typeof channel?.runTool === 'function'
          ? await channel.runTool(GalleryTool.MIGRATE_ARTM2, { sourceDir })
          : await channel?.send('curator:tool_call', {
              tool: GalleryTool.MIGRATE_ARTM2,
              args: { sourceDir },
            });
      console.log('Migration Result:', res?.result || res);
    },
  },
];

export interface CreateGalleryClientShellOptions extends Partial<ClientShellConfig> {
  channel: CuratorChannel;
}

export function createGalleryClientShell(
  options: CreateGalleryClientShellOptions
): ClientShell {
  return createClientShell({
    prompt: 'gallery> ',
    commands: GALLERY_COMMANDS,
    ...options,
  });
}
