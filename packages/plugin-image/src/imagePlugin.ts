import { defineTool, type CuratorPlugin } from '@curator/agent-server';
import { ImageProcessorService } from './ImageProcessorService.js';

export interface ImagePluginOptions {
  imageProcessor?: ImageProcessorService;
}

export function createImagePlugin(options: ImagePluginOptions = {}): {
  plugin: CuratorPlugin;
  imageProcessor: ImageProcessorService;
} {
  const imageProcessor = options.imageProcessor || new ImageProcessorService();

  const image_inspect = defineTool({
    name: 'image_inspect',
    description: 'Inspect an image file on disk and return its dimensions, format, byte size, and aspect ratio.',
    mcp: { expose: true },
    accessLevel: 'safe_read',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the image file on disk' },
      },
      required: ['filePath'],
    },
    execute: async (args: any) => {
      return await imageProcessor.inspectImage(String(args.filePath));
    },
  });

  const image_generate_thumbnail = defineTool({
    name: 'image_generate_thumbnail',
    description: 'Generate a web-optimized thumbnail from a source image file.',
    mcp: { expose: true },
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        inputPath: { type: 'string', description: 'Source image file path' },
        outputPath: { type: 'string', description: 'Destination thumbnail file path' },
        width: { type: 'number', description: 'Target thumbnail width in pixels (default: 250)' },
        quality: { type: 'number', description: 'Compression quality 1-100 (default: 80)' },
        format: { type: 'string', description: 'Output format (jpeg, webp, png)' },
        overwrite: { type: 'boolean', description: 'Overwrite existing thumbnail if present' },
      },
      required: ['inputPath', 'outputPath'],
    },
    execute: async (args: any) => {
      return await imageProcessor.generateThumbnail(String(args.inputPath), String(args.outputPath), {
        width: args.width ? Number(args.width) : 250,
        quality: args.quality ? Number(args.quality) : 80,
        format: args.format || 'jpeg',
        overwrite: Boolean(args.overwrite),
      });
    },
  });

  const image_resize = defineTool({
    name: 'image_resize',
    description: 'Resize and convert an image file to the given dimensions and format.',
    mcp: { expose: true },
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        inputPath: { type: 'string', description: 'Source image file path' },
        outputPath: { type: 'string', description: 'Destination image file path' },
        width: { type: 'number', description: 'Max width in pixels' },
        height: { type: 'number', description: 'Max height in pixels' },
        quality: { type: 'number', description: 'Compression quality 1-100' },
        format: { type: 'string', description: 'Output format (jpeg, webp, png)' },
      },
      required: ['inputPath', 'outputPath'],
    },
    execute: async (args: any) => {
      return await imageProcessor.resizeImage(String(args.inputPath), String(args.outputPath), {
        width: args.width ? Number(args.width) : 1200,
        height: args.height ? Number(args.height) : null,
        quality: args.quality ? Number(args.quality) : 85,
        format: args.format || 'jpeg',
        overwrite: true,
      });
    },
  });

  const image_batch_thumbnails = defineTool({
    name: 'image_batch_thumbnails',
    description: 'Batch-generate thumbnails for all images in a directory.',
    mcp: { expose: true },
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        photosDir: { type: 'string', description: 'Directory containing source photos' },
        thumbnailsDir: { type: 'string', description: 'Directory to write thumbnails into' },
        width: { type: 'number', description: 'Thumbnail width (default: 250)' },
        overwrite: { type: 'boolean', description: 'Whether to overwrite existing thumbnails' },
      },
      required: ['photosDir', 'thumbnailsDir'],
    },
    execute: async (args: any) => {
      return await imageProcessor.processBatchThumbnails(
        String(args.photosDir),
        String(args.thumbnailsDir),
        {
          width: args.width ? Number(args.width) : 250,
          overwrite: Boolean(args.overwrite),
        }
      );
    },
  });

  const plugin: CuratorPlugin = {
    name: 'plugin-image',
    version: '1.0.0',
    description: 'Image Inspection, Resizing & Thumbnail Generation Plugin',
    tools: {
      image_inspect,
      image_generate_thumbnail,
      image_resize,
      image_batch_thumbnails,
    },
  };

  return { plugin, imageProcessor };
}

