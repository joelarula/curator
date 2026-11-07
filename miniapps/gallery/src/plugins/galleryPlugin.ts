import {
  type CuratorPlugin,
  type CuratorScriptDefinition,
  CuratorSystemRole,
} from '@curator/agent-server';
import { GalleryRole, GalleryTool, GalleryModule } from '../models/index.ts';
import {
  GALLERY_WORKFLOW_ASTS,
  buildMigrateArtm2AST,
  buildRegenerateThumbnailsAST,
} from '../workflows/index.ts';
import { createGalleryTools, type GalleryToolsDeps } from './galleryTools.ts';

const SCRIPT_DESCRIPTIONS: Record<string, string> = {
  [GalleryModule.PIPELINE_MIGRATE_ARTM2]:
    'ArtMoments (Z:\\artm2) full catalog, category, author, and image migration pipeline',
  [GalleryModule.PIPELINE_INGEST_ARTWORK]:
    'Artwork upload, 250px thumbnail generation, and Curator Resource/Attachment ingestion pipeline',
  [GalleryModule.PIPELINE_REGENERATE_THUMBNAILS]:
    'Batch 250px JPEG thumbnail inspection and regeneration pipeline',
};

export const galleryScripts: Record<string, CuratorScriptDefinition> = Object.fromEntries(
  Object.entries(GALLERY_WORKFLOW_ASTS).map(([name, ast]) => [
    name,
    {
      name,
      description: SCRIPT_DESCRIPTIONS[name] || `Gallery AST workflow for ${name}`,
      ast,
      run: async () => {},
    },
  ])
);

export function createGalleryPlugin(deps: GalleryToolsDeps): CuratorPlugin {
  const { whitelistedTools } = createGalleryTools(deps);

  return {
    name: 'miniapp:gallery',
    version: '1.0.0',
    description:
      'Curator Multi-Tenant Artwork & Media Gallery Engine with File Storage, Thumbnail Processing, and MCP Exposure',
    roles: {
      [GalleryRole.ADMIN]: {
        name: GalleryRole.ADMIN,
        description:
          'Gallery Administrator with full migration, project creation, bulk deletion, and configuration privileges',
        subRoles: [GalleryRole.CURATOR],
        tools: [
          GalleryTool.MIGRATE_ARTM2,
          GalleryTool.DISCOVER_ARTM2,
          GalleryTool.IMPORT_ARTM2_BATCH,
          GalleryTool.DELETE_ITEM,
          GalleryTool.BULK_UPDATE,
          GalleryTool.UPSERT_INFO,
        ],
      },
      [GalleryRole.CURATOR]: {
        name: GalleryRole.CURATOR,
        description:
          'Gallery Curator authorized to upload artworks, edit metadata, manage categories/authors, and regenerate thumbnails',
        subRoles: [GalleryRole.VIEWER],
        tools: [
          GalleryTool.UPSERT_ITEM,
          GalleryTool.UPLOAD_AND_INGEST,
          GalleryTool.UPSERT_CATEGORY,
          GalleryTool.UPSERT_AUTHOR,
          GalleryTool.REGENERATE_THUMBNAIL,
        ],
      },
      [GalleryRole.VIEWER]: {
        name: GalleryRole.VIEWER,
        description:
          'Public Gallery Visitor and MCP Client authorized to search paintings, browse categories/authors, and inspect artwork details',
        tools: [
          GalleryTool.SHOW_RESOURCES,
          GalleryTool.SEARCH_ITEMS,
          GalleryTool.GET_ITEM,
          GalleryTool.LIST_CATEGORIES,
          GalleryTool.LIST_AUTHORS,
          GalleryTool.GET_INFO,
          GalleryTool.GET_STATS,
          GalleryTool.SPEECH,
        ],
      },
    },
    defaultUserRoles: [GalleryRole.ADMIN, GalleryRole.CURATOR, GalleryRole.VIEWER],
    systemRoles: [
      CuratorSystemRole.ADMIN,
      GalleryRole.ADMIN,
      GalleryRole.CURATOR,
      GalleryRole.VIEWER,
    ],
    tools: whitelistedTools,
    scripts: galleryScripts,
    agents: {
      gallery_artm2_migrator: {
        ast: buildMigrateArtm2AST(),
        schedule: '0 3 * * *',
        enabled: false,
      },
      gallery_thumbnail_maintainer: {
        ast: buildRegenerateThumbnailsAST({ overwrite: false, width: 250 }),
        schedule: '0 4 * * *',
        enabled: true,
      },
    } as any,
  };
}
