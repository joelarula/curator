import path from 'node:path';
import crypto from 'node:crypto';
import { defineTool, type CuratorTool } from '@curator/agent-server';
import type { CuratorToolDefinition } from '@curator/host';
import type { StorageService } from '@curator/plugin-storage';
import type { ImageProcessorService } from '@curator/plugin-image';
import { GalleryRole, GalleryTool } from '../models/index.ts';
import { GalleryRepository, slugifyLink } from '../services/galleryRepository.ts';
import { Artm2Migrator } from '../services/artm2Migrator.ts';

export interface GalleryToolsDeps {
  repo: GalleryRepository;
  storage: StorageService;
  imageProcessor: ImageProcessorService;
  migrator: Artm2Migrator;
}

export function createGalleryTools(deps: GalleryToolsDeps): {
  toolsMap: Record<string, CuratorTool & CuratorToolDefinition>;
  whitelistedTools: (CuratorTool & CuratorToolDefinition)[];
} {
  const { repo, storage, imageProcessor, migrator } = deps;

  // 1. gallery_show_resources — Primary UI surface generator for Curator Console & Harness
  const galleryShowResourcesTool = defineTool({
    name: GalleryTool.SHOW_RESOURCES,
    description:
      'Display gallery resources in an interactive Grid or List view surface above the prompt or in the Worktable.',
    usage: '[search] [categoryKey] [authorKey] [viewMode]',
    aliases: ['resources', 'show_resources', 'list_resources', 'grid', 'list'],
    mcp: { expose: true },
    requiredRole: GalleryRole.VIEWER,
    accessLevel: 'safe_read',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID (default: artmoments)' },
        search: { type: 'string', description: 'Optional search filter' },
        categoryKey: { type: 'string', description: 'Optional category key (e.g. ABSTRACT, FLOWERS)' },
        authorKey: { type: 'string', description: 'Optional author key (e.g. DI, SIL)' },
        publishedOnly: { type: 'boolean', description: 'Filter only published items' },
        viewMode: { type: 'string', description: 'Initial view mode: grid or list', default: 'grid' },
        limit: { type: 'number', description: 'Max items to return (default: 250)', default: 250 },
        offset: { type: 'number', description: 'Pagination offset', default: 0 },
      },
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      const viewMode = args?.viewMode === 'list' ? 'list' : 'grid';
      const result = await repo.searchItems({
        projectId,
        search: args?.search,
        categoryKey: args?.categoryKey,
        authorKey: args?.authorKey,
        publishedOnly: args?.publishedOnly ?? false,
        limit: args?.limit ?? 250,
        offset: args?.offset ?? 0,
      });

      return {
        ...result,
        uiSurface: {
          component: 'resource-collection',
          title: `Gallery Resources (${projectId})`,
          viewMode,
          items: result.items,
          total: result.total,
          categories: result.categories,
          authors: result.authors,
        },
      };
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 2. gallery_search_items — Public & MCP search tool
  const gallerySearchItemsTool = defineTool({
    name: GalleryTool.SEARCH_ITEMS,
    description: 'Search and filter paintings/artworks in the gallery by keyword, category, or author.',
    usage: '[search] [categoryKey] [authorKey]',
    aliases: ['search', 'find_paintings', 'get_paintings_by_category'],
    mcp: { expose: true },
    requiredRole: GalleryRole.VIEWER,
    accessLevel: 'safe_read',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID (default: artmoments)' },
        search: { type: 'string', description: 'Search query for title, author, or category' },
        categoryKey: { type: 'string', description: 'Category key (e.g. ABSTRACT, FLOWERS, NATURE)' },
        categoryLink: { type: 'string', description: 'Category URL slug (e.g. abstraktne, lilled)' },
        authorKey: { type: 'string', description: 'Author key (e.g. DI, SIL, TUU, ANON)' },
        publishedOnly: { type: 'boolean', description: 'Only return published items (default: true)' },
        limit: { type: 'number', description: 'Maximum items to return (default: 100)' },
        offset: { type: 'number', description: 'Pagination offset (default: 0)' },
      },
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      const categoryKey = args?.categoryKey || args?.category_key;
      const publishedOnly = args?.publishedOnly !== undefined ? Boolean(args.publishedOnly) : true;
      const result = await repo.searchItems({
        projectId,
        search: args?.search || args?.query,
        categoryKey,
        categoryLink: args?.categoryLink,
        authorKey: args?.authorKey,
        publishedOnly,
        limit: args?.limit ?? 100,
        offset: args?.offset ?? 0,
      });

      return {
        ...result,
        uiSurface: {
          component: 'resource-collection',
          title: `Search Results (${result.total})`,
          viewMode: 'grid',
          items: result.items,
          total: result.total,
          categories: result.categories,
          authors: result.authors,
        },
      };
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 3. gallery_get_item — Detail view tool
  const galleryGetItemTool = defineTool({
    name: GalleryTool.GET_ITEM,
    description: 'Retrieve full details, author, categories, and media URLs for a single artwork by key or link slug.',
    usage: '<keyOrLink>',
    aliases: ['item', 'painting', 'inspect_item'],
    mcp: { expose: true },
    requiredRole: GalleryRole.VIEWER,
    accessLevel: 'safe_read',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
        keyOrLink: { type: 'string', description: 'Artwork UUID key, title, or URL slug (e.g. 103)' },
      },
      required: ['keyOrLink'],
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      const keyOrLink = String(args?.keyOrLink || args?.id || args?.key || '');
      const item = await repo.getItem({ projectId, keyOrLink });
      if (!item) {
        throw new Error(`Gallery item not found: ${keyOrLink}`);
      }
      return {
        item,
        uiSurface: {
          component: 'resource-detail',
          title: item.title,
          item,
        },
      };
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 4. gallery_list_categories
  const galleryListCategoriesTool = defineTool({
    name: GalleryTool.LIST_CATEGORIES,
    description: 'List all gallery categories with artwork counts.',
    usage: '[includeUnpublished]',
    aliases: ['categories'],
    mcp: { expose: true },
    requiredRole: GalleryRole.VIEWER,
    accessLevel: 'safe_read',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
        includeUnpublished: { type: 'boolean', description: 'Include unpublished categories' },
      },
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      const categories = await repo.listCategories({
        projectId,
        includeUnpublished: Boolean(args?.includeUnpublished),
      });
      return { categories, count: categories.length };
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 5. gallery_list_authors
  const galleryListAuthorsTool = defineTool({
    name: GalleryTool.LIST_AUTHORS,
    description: 'List all gallery authors/artists with published artwork counts.',
    usage: '',
    aliases: ['authors', 'artists'],
    mcp: { expose: true },
    requiredRole: GalleryRole.VIEWER,
    accessLevel: 'safe_read',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
      },
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      const authors = await repo.listAuthors({ projectId });
      return { authors, count: authors.length };
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 6. gallery_get_info
  const galleryGetInfoTool = defineTool({
    name: GalleryTool.GET_INFO,
    description: 'Get gallery about page markdown, ordering information, contact details, and structured data.',
    usage: '',
    aliases: ['info', 'about', 'contact'],
    mcp: { expose: true },
    requiredRole: GalleryRole.VIEWER,
    accessLevel: 'safe_read',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
      },
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      return await repo.getGalleryInfo({ projectId });
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 7. gallery_get_stats
  const galleryGetStatsTool = defineTool({
    name: GalleryTool.GET_STATS,
    description: 'Get gallery statistics (total artworks, published, drafts, categories, authors, attachments).',
    usage: '',
    aliases: ['stats'],
    mcp: { expose: true },
    requiredRole: GalleryRole.VIEWER,
    accessLevel: 'safe_read',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
      },
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      return await repo.getStats({ projectId });
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 8. gallery_upsert_item
  const galleryUpsertItemTool = defineTool({
    name: GalleryTool.UPSERT_ITEM,
    description: 'Create or update a gallery artwork Resource, its Author/Category Relations, and Attachments.',
    usage: '<key> <name>',
    mcp: { expose: true },
    requiredRole: GalleryRole.CURATOR,
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
        key: { type: 'string', description: 'Unique artwork key or UUID' },
        name: { type: 'string', description: 'Artwork title / name' },
        link: { type: 'string', description: 'URL slug' },
        photo: { type: 'string', description: 'Photo filename in VM storage' },
        photoUrl: { type: 'string', description: 'Photo URL' },
        thumbnailUrl: { type: 'string', description: 'Thumbnail URL' },
        authorKey: { type: 'string', description: 'Author key (e.g. DI, SIL)' },
        categoryKeys: { type: 'array', items: { type: 'string' }, description: 'Category keys' },
        published: { type: 'boolean', description: 'Whether item is published' },
        description: { type: 'string', description: 'Optional artwork description' },
      },
      required: ['name'],
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      const key = args?.key ? String(args.key) : crypto.randomUUID();
      const item = await repo.upsertItem({
        projectId,
        key,
        name: String(args.name || key),
        link: args.link,
        photo: args.photo,
        photoUrl: args.photoUrl,
        thumbnailUrl: args.thumbnailUrl,
        authorKey: args.authorKey,
        categoryKeys: args.categoryKeys,
        published: args.published,
        description: args.description,
      });
      return { success: true, item };
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 9. gallery_delete_item
  const galleryDeleteItemTool = defineTool({
    name: GalleryTool.DELETE_ITEM,
    description: 'Soft-delete a gallery artwork Resource by key.',
    usage: '<key>',
    mcp: { expose: true },
    requiredRole: GalleryRole.CURATOR,
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
        key: { type: 'string', description: 'Artwork key to delete' },
      },
      required: ['key'],
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      return await repo.deleteItem({ projectId, key: String(args.key) });
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 10. gallery_bulk_update
  const galleryBulkUpdateTool = defineTool({
    name: GalleryTool.BULK_UPDATE,
    description: 'Bulk publish, unpublish, categorize, or delete multiple gallery items by key.',
    usage: '<action> <keys>',
    mcp: { expose: true },
    requiredRole: GalleryRole.CURATOR,
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
        keys: { type: 'array', items: { type: 'string' }, description: 'List of item keys' },
        action: { type: 'string', description: 'Action: publish | unpublish | delete | categorize' },
        categoryKey: { type: 'string', description: 'Category key when action is categorize' },
      },
      required: ['keys', 'action'],
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      return await repo.bulkUpdateItems({
        projectId,
        keys: Array.isArray(args.keys) ? args.keys : [],
        action: args.action,
        categoryKey: args.categoryKey,
      });
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 11. gallery_upsert_category
  const galleryUpsertCategoryTool = defineTool({
    name: GalleryTool.UPSERT_CATEGORY,
    description: 'Create or update a gallery category Resource and its ResourceTree navigation node.',
    usage: '<key> <name>',
    mcp: { expose: true },
    requiredRole: GalleryRole.CURATOR,
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
        key: { type: 'string', description: 'Unique category key (e.g. ABSTRACT)' },
        name: { type: 'string', description: 'Display name (Estonian/Primary)' },
        nameEn: { type: 'string', description: 'Display name in English' },
        link: { type: 'string', description: 'URL slug' },
        published: { type: 'boolean', description: 'Whether category is published' },
        exposed: { type: 'boolean', description: 'Whether category is exposed' },
      },
      required: ['key', 'name'],
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      return await repo.upsertCategory({
        projectId,
        key: String(args.key),
        name: String(args.name),
        nameEn: args.nameEn,
        link: args.link,
        published: args.published,
        exposed: args.exposed,
      });
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 12. gallery_upsert_author
  const galleryUpsertAuthorTool = defineTool({
    name: GalleryTool.UPSERT_AUTHOR,
    description: 'Create or update a gallery author/artist Resource.',
    usage: '<key> <name>',
    mcp: { expose: true },
    requiredRole: GalleryRole.CURATOR,
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
        key: { type: 'string', description: 'Unique author key (e.g. DI, SIL)' },
        name: { type: 'string', description: 'Full artist name' },
        link: { type: 'string', description: 'URL slug' },
        bio: { type: 'string', description: 'Optional artist biography' },
      },
      required: ['key', 'name'],
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      return await repo.upsertAuthor({
        projectId,
        key: String(args.key),
        name: String(args.name),
        link: args.link,
        bio: args.bio,
      });
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 13. gallery_upsert_info
  const galleryUpsertInfoTool = defineTool({
    name: GalleryTool.UPSERT_INFO,
    description: 'Update gallery title, subtitle, about/ordering markdown pages, and contact info.',
    usage: '',
    mcp: { expose: true },
    requiredRole: GalleryRole.CURATOR,
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
        title: { type: 'string' },
        subtitle: { type: 'string' },
        aboutMarkdown: { type: 'string' },
        orderingMarkdown: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
      },
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      return await repo.upsertGalleryInfo({
        projectId,
        ...args,
      });
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 14. gallery_upload_and_ingest — Saves file to VM storage, generates thumbnail via @curator/plugin-image, and creates Gallery Item
  const galleryUploadAndIngestTool = defineTool({
    name: GalleryTool.UPLOAD_AND_INGEST,
    description:
      'Upload an image to VM file storage, automatically generate its 250px thumbnail, and create/update a Gallery Artwork Resource.',
    usage: '<filename> <dataBase64>',
    mcp: { expose: true },
    requiredRole: GalleryRole.CURATOR,
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
        filename: { type: 'string', description: 'Image filename (e.g. 500.png)' },
        dataBase64: { type: 'string', description: 'Optional base64 file content if not already uploaded' },
        name: { type: 'string', description: 'Artwork title (defaults to filename stem)' },
        authorKey: { type: 'string', description: 'Author key (default: DI)' },
        categoryKeys: { type: 'array', items: { type: 'string' }, description: 'Category keys' },
        published: { type: 'boolean', description: 'Publish immediately (default: true)' },
      },
      required: ['filename'],
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      const filename = String(args.filename);
      const stem = path.parse(filename).name;
      const name = String(args.name || stem);
      const link = slugifyLink(name);

      let storedPhoto;
      const rawBase64 = args.dataBase64 || args.data;
      if (rawBase64) {
        storedPhoto = await storage.saveFile({
          projectId,
          bucket: 'photos',
          filename,
          data: String(rawBase64),
          encoding: 'base64',
        });
      } else {
        const resolved = storage.resolveFilePath(projectId, 'photos', filename);
        storedPhoto = {
          diskPath: resolved.diskPath,
          url: resolved.url,
          filename: resolved.safeFilename,
          size: 0,
        };
      }

      const thumbFilename = `${path.parse(storedPhoto.filename).name}.jpg`;
      const { diskPath: thumbDiskPath, url: thumbnailUrl } = storage.resolveFilePath(
        projectId,
        'thumbnails',
        thumbFilename
      );

      const thumbResult = await imageProcessor.generateThumbnail(storedPhoto.diskPath, thumbDiskPath, {
        width: 250,
        quality: 80,
        format: 'jpeg',
        overwrite: true,
      });

      const meta = await imageProcessor.inspectImage(storedPhoto.diskPath);

      const item = await repo.upsertItem({
        projectId,
        key: args.key || crypto.randomUUID(),
        name,
        link,
        photo: storedPhoto.filename,
        photoUrl: storedPhoto.url,
        thumbnailUrl,
        authorKey: args.authorKey || 'DI',
        categoryKeys: Array.isArray(args.categoryKeys) ? args.categoryKeys : ['UNCATEGORIZED'],
        published: args.published !== undefined ? Boolean(args.published) : true,
        width: meta.width,
        height: meta.height,
        size: meta.size,
      });

      return {
        success: true,
        item,
        thumbnail: thumbResult,
      };
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 15. gallery_regenerate_thumbnail
  const galleryRegenerateThumbnailTool = defineTool({
    name: GalleryTool.REGENERATE_THUMBNAIL,
    description: 'Regenerate the 250px thumbnail in VM storage for an existing gallery artwork.',
    usage: '<key>',
    mcp: { expose: true },
    requiredRole: GalleryRole.CURATOR,
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Gallery project ID' },
        key: { type: 'string', description: 'Artwork key or link' },
      },
      required: ['key'],
    },
    execute: async (args: any, ctx: any) => {
      const projectId = args?.projectId || ctx?.projectId || repo.defaultProjectId;
      const item = await repo.getItem({ projectId, keyOrLink: String(args.key) });
      if (!item || !item.photo) {
        throw new Error(`Artwork or photo not found for key: ${args.key}`);
      }
      const { diskPath: photoPath } = storage.resolveFilePath(projectId, 'photos', item.photo);
      const thumbName = `${path.parse(item.photo).name}.jpg`;
      const { diskPath: thumbPath, url: thumbnailUrl } = storage.resolveFilePath(projectId, 'thumbnails', thumbName);

      const result = await imageProcessor.generateThumbnail(photoPath, thumbPath, {
        width: 250,
        quality: 80,
        format: 'jpeg',
        overwrite: true,
      });

      await repo.upsertItem({
        projectId,
        key: item.key,
        name: item.name,
        thumbnailUrl,
      });

      return { success: true, key: item.key, thumbnailUrl, result };
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 16. gallery_discover_artm2
  const galleryDiscoverArtm2Tool = defineTool({
    name: GalleryTool.DISCOVER_ARTM2,
    description: 'Inspect Z:\\artm2\\gallery\\data\\db and return a migration manifest of authors, categories, paintings, and media files.',
    usage: '[sourceDir]',
    mcp: { expose: true },
    requiredRole: GalleryRole.ADMIN,
    accessLevel: 'safe_read',
    parameters: {
      type: 'object',
      properties: {
        sourceDir: { type: 'string', description: 'Source directory (default: Z:/artm2/gallery/data/db)' },
      },
    },
    execute: async (args: any) => {
      return await migrator.discover(args?.sourceDir || 'Z:/artm2/gallery/data/db');
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 17. gallery_import_artm2_batch
  const galleryImportArtm2BatchTool = defineTool({
    name: GalleryTool.IMPORT_ARTM2_BATCH,
    description: 'Import a batch of paintings and copy/generate their photos & thumbnails from Z:\\artm2 into Curator Core DB and VM storage.',
    usage: '[offset] [limit]',
    mcp: { expose: true },
    requiredRole: GalleryRole.ADMIN,
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        sourceDir: { type: 'string', description: 'Source directory (default: Z:/artm2/gallery/data/db)' },
        projectId: { type: 'string', description: 'Target project ID (default: artmoments)' },
        offset: { type: 'number', description: 'Batch start offset', default: 0 },
        limit: { type: 'number', description: 'Batch size', default: 100 },
        copyMedia: { type: 'boolean', description: 'Copy photos & thumbnails to VM storage', default: true },
      },
    },
    execute: async (args: any, ctx: any) => {
      return await migrator.migratePaintingsBatch({
        sourceDir: args?.sourceDir,
        projectId: args?.projectId || ctx?.projectId,
        offset: args?.offset ?? 0,
        limit: args?.limit ?? 100,
        copyMedia: args?.copyMedia ?? true,
      });
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 18. gallery_migrate_artm2 — Full one-call migration tool
  const galleryMigrateArtm2Tool = defineTool({
    name: GalleryTool.MIGRATE_ARTM2,
    description: 'Migrate all authors, categories, 739 paintings, contact info, markdown pages, and VM photos/thumbnails from Z:\\artm2 into Curator Core DB.',
    usage: '[sourceDir]',
    mcp: { expose: true },
    requiredRole: GalleryRole.ADMIN,
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        sourceDir: { type: 'string', description: 'Source directory (default: Z:/artm2/gallery/data/db)' },
        projectId: { type: 'string', description: 'Target project ID (default: artmoments)' },
        copyMedia: { type: 'boolean', description: 'Copy photos & thumbnails to VM storage', default: true },
      },
    },
    execute: async (args: any, ctx: any) => {
      return await migrator.migrateAll({
        sourceDir: args?.sourceDir,
        projectId: args?.projectId || ctx?.projectId,
        copyMedia: args?.copyMedia ?? true,
      });
    },
  }) as CuratorTool & CuratorToolDefinition;

  // 19. gallery_speech — Ambient free-text / conversational tool
  const gallerySpeechTool = defineTool({
    name: GalleryTool.SPEECH,
    description: 'Interpret operator natural-language prompts for gallery search, resource views, and administration.',
    usage: '<message>',
    mcp: { expose: false },
    requiredRole: GalleryRole.VIEWER,
    accessLevel: 'safe_read',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Free-text prompt from operator' },
      },
    },
    execute: async (args: any, ctx: any) => {
      const msg = String(args?.message || args?.speech || args?.prompt || '').trim();
      const lower = msg.toLowerCase();
      const projectId = ctx?.projectId || repo.defaultProjectId;

      if (lower.includes('stat')) {
        return await repo.getStats({ projectId });
      }
      if (lower.includes('categor')) {
        return { categories: await repo.listCategories({ projectId, includeUnpublished: true }) };
      }
      if (lower.includes('author') || lower.includes('artist')) {
        return { authors: await repo.listAuthors({ projectId }) };
      }

      // Default: search or show resources surface
      const cleanedQuery = lower
        .replace(/^(show\s+app\s+resources|show\s+resources|show\s+gallery|search|find|list)\s*/i, '')
        .replace(/\b(in\s+)?(grid|list)\s+view\b/gi, '')
        .trim();
      const viewMode = lower.includes('list view') ? 'list' : 'grid';
      const res = await repo.searchItems({
        projectId,
        search: cleanedQuery || undefined,
        publishedOnly: false,
        limit: 250,
      });

      return {
        ...res,
        uiSurface: {
          component: 'resource-collection',
          title: cleanedQuery ? `Resources matching "${cleanedQuery}"` : 'Gallery Resources',
          viewMode,
          items: res.items,
          total: res.total,
          categories: res.categories,
          authors: res.authors,
        },
      };
    },
  }) as CuratorTool & CuratorToolDefinition;

  const toolsMap: Record<string, CuratorTool & CuratorToolDefinition> = {
    [GalleryTool.SHOW_RESOURCES]: galleryShowResourcesTool,
    [GalleryTool.SEARCH_ITEMS]: gallerySearchItemsTool,
    [GalleryTool.GET_ITEM]: galleryGetItemTool,
    [GalleryTool.LIST_CATEGORIES]: galleryListCategoriesTool,
    [GalleryTool.LIST_AUTHORS]: galleryListAuthorsTool,
    [GalleryTool.GET_INFO]: galleryGetInfoTool,
    [GalleryTool.GET_STATS]: galleryGetStatsTool,
    [GalleryTool.UPSERT_ITEM]: galleryUpsertItemTool,
    [GalleryTool.DELETE_ITEM]: galleryDeleteItemTool,
    [GalleryTool.BULK_UPDATE]: galleryBulkUpdateTool,
    [GalleryTool.UPSERT_CATEGORY]: galleryUpsertCategoryTool,
    [GalleryTool.UPSERT_AUTHOR]: galleryUpsertAuthorTool,
    [GalleryTool.UPSERT_INFO]: galleryUpsertInfoTool,
    [GalleryTool.UPLOAD_AND_INGEST]: galleryUploadAndIngestTool,
    [GalleryTool.REGENERATE_THUMBNAIL]: galleryRegenerateThumbnailTool,
    [GalleryTool.DISCOVER_ARTM2]: galleryDiscoverArtm2Tool,
    [GalleryTool.IMPORT_ARTM2_BATCH]: galleryImportArtm2BatchTool,
    [GalleryTool.MIGRATE_ARTM2]: galleryMigrateArtm2Tool,
    [GalleryTool.SPEECH]: gallerySpeechTool,
  };

  const whitelistedTools = Object.values(toolsMap);
  return { toolsMap, whitelistedTools };
}

