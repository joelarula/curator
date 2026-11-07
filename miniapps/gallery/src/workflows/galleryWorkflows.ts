import type { CuratorSequentialNode, CuratorToolNode } from '@curator/agent-server';
import { GalleryModule, GalleryTool } from '../models/index.ts';

export interface MigrateArtm2PipelineOptions {
  sourceDir?: string;
  projectId?: string;
  copyFiles?: boolean;
  generateMissingThumbnails?: boolean;
}

export interface IngestArtworkPipelineOptions {
  projectId?: string;
  name?: string;
  authorKey?: string;
  categoryKeys?: string[];
  published?: boolean;
  sourceFilePath?: string;
  filename?: string;
}

export interface RegenerateThumbnailsPipelineOptions {
  projectId?: string;
  overwrite?: boolean;
  width?: number;
}

/**
 * Step helper: pure Curator_Tool AST node.
 */
export function createToolStep(
  toolName: string,
  args: Record<string, unknown>,
  outputKey?: string
): CuratorToolNode {
  return {
    type: 'Curator_Tool',
    toolName,
    args,
    ...(outputKey ? { outputKey } : {}),
  };
}

/**
 * Builds the `pipeline_migrate_artm2` AST workflow:
 * 1. Migrate authors, categories, paintings, contact, markdown pages, and copy/generate thumbnails.
 * 2. Compute and return updated gallery stats & resource surface.
 */
export function buildMigrateArtm2AST(
  options: MigrateArtm2PipelineOptions = {}
): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: GalleryModule.PIPELINE_MIGRATE_ARTM2,
    subAgents: [
      createToolStep(
        GalleryTool.MIGRATE_ARTM2,
        {
          sourceDir: options.sourceDir || 'Z:\\artm2\\gallery\\data\\db',
          projectId: options.projectId || 'artmoments',
          copyFiles: options.copyFiles ?? true,
          generateMissingThumbnails: options.generateMissingThumbnails ?? true,
        },
        'migration'
      ),
      createToolStep(
        GalleryTool.GET_STATS,
        {
          projectId: options.projectId || 'artmoments',
        },
        'stats'
      ),
    ],
  };
}

/**
 * Builds the `pipeline_ingest_artwork` AST workflow:
 * 1. Upload/copy original image, generate 250px thumbnail, and create Resource + Attachments + Relations.
 * 2. Display updated gallery resource collection surface.
 */
export function buildIngestArtworkAST(
  options: IngestArtworkPipelineOptions = {}
): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: GalleryModule.PIPELINE_INGEST_ARTWORK,
    subAgents: [
      createToolStep(
        GalleryTool.UPLOAD_AND_INGEST,
        {
          projectId: options.projectId || 'artmoments',
          name: options.name || '{{input.name}}',
          authorKey: options.authorKey || '{{input.authorKey}}',
          categoryKeys: options.categoryKeys || ['UNCATEGORIZED'],
          published: options.published ?? true,
          sourceFilePath: options.sourceFilePath || '{{input.sourceFilePath}}',
          filename: options.filename || '{{input.filename}}',
        },
        'createdItem'
      ),
      createToolStep(
        GalleryTool.SHOW_RESOURCES,
        {
          projectId: options.projectId || 'artmoments',
          viewMode: 'grid',
        },
        'surface'
      ),
    ],
  };
}

/**
 * Builds the `pipeline_regenerate_thumbnails` AST workflow:
 * 1. Scan all photos in the gallery project and generate any missing or forced 250px JPEG thumbnails.
 * 2. Return updated gallery statistics.
 */
export function buildRegenerateThumbnailsAST(
  options: RegenerateThumbnailsPipelineOptions = {}
): CuratorSequentialNode {
  return {
    type: 'Curator_Sequential',
    name: GalleryModule.PIPELINE_REGENERATE_THUMBNAILS,
    subAgents: [
      createToolStep(
        GalleryTool.REGENERATE_THUMBNAIL,
        {
          projectId: options.projectId || 'artmoments',
          overwrite: options.overwrite ?? false,
          width: options.width ?? 250,
        },
        'thumbnails'
      ),
      createToolStep(
        GalleryTool.GET_STATS,
        {
          projectId: options.projectId || 'artmoments',
        },
        'stats'
      ),
    ],
  };
}

export const GALLERY_WORKFLOW_ASTS: Record<string, CuratorSequentialNode> = {
  [GalleryModule.PIPELINE_MIGRATE_ARTM2]: buildMigrateArtm2AST(),
  [GalleryModule.PIPELINE_INGEST_ARTWORK]: buildIngestArtworkAST(),
  [GalleryModule.PIPELINE_REGENERATE_THUMBNAILS]: buildRegenerateThumbnailsAST(),
};
