import { defineTool, type CuratorPlugin } from '@curator/agent-server';
import { StorageService, type StorageServiceOptions } from './StorageService.js';

export interface StoragePluginOptions extends StorageServiceOptions {
  storageService?: StorageService;
}

export function createStoragePlugin(options: StoragePluginOptions = {}): {
  plugin: CuratorPlugin;
  storage: StorageService;
} {
  const storage = options.storageService || new StorageService(options);

  const storage_upload_file = defineTool({
    name: 'storage_upload_file',
    description: 'Save a base64 or text file into VM file storage and upsert a Curator Attachment record.',
    mcp: { expose: true },
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID scope (default: artmoments)' },
        bucket: {
          type: 'string',
          description: 'Target storage bucket (photos, thumbnails, originals, assets)',
        },
        filename: { type: 'string', description: 'Target filename (e.g. 103.png)' },
        dataBase64: { type: 'string', description: 'Base64-encoded file content' },
        mimeType: { type: 'string', description: 'Optional MIME type' },
        resourceId: { type: 'number', description: 'Optional Curator Resource numeric ID to attach to' },
      },
      required: ['filename', 'dataBase64'],
    },
    execute: async (args: any, ctx: any) => {
      const prisma = ctx?.prisma || storage.prisma;
      return await storage.saveFile(
        {
          projectId: args.projectId || ctx?.projectId,
          bucket: args.bucket || 'photos',
          filename: String(args.filename),
          data: String(args.dataBase64),
          encoding: 'base64',
          mimeType: args.mimeType,
          resourceId: args.resourceId ? Number(args.resourceId) : undefined,
        },
        prisma
      );
    },
  });

  const storage_copy_local_file = defineTool({
    name: 'storage_copy_local_file',
    description: 'Copy a local file on the machine into project VM file storage and register a Curator Attachment.',
    mcp: { expose: true },
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        sourcePath: { type: 'string', description: 'Absolute or relative path to the source file' },
        projectId: { type: 'string', description: 'Project ID scope' },
        bucket: { type: 'string', description: 'Target storage bucket (photos, thumbnails, originals, assets)' },
        filename: { type: 'string', description: 'Optional destination filename' },
        resourceId: { type: 'number', description: 'Optional Curator Resource ID' },
      },
      required: ['sourcePath'],
    },
    execute: async (args: any, ctx: any) => {
      const prisma = ctx?.prisma || storage.prisma;
      return await storage.copyLocalFile(
        {
          sourcePath: String(args.sourcePath),
          projectId: args.projectId || ctx?.projectId,
          bucket: args.bucket || 'photos',
          filename: args.filename ? String(args.filename) : undefined,
          resourceId: args.resourceId ? Number(args.resourceId) : undefined,
        },
        prisma
      );
    },
  });

  const storage_list_files = defineTool({
    name: 'storage_list_files',
    description: 'List physical files stored in a VM storage bucket for a project.',
    mcp: { expose: true },
    accessLevel: 'safe_read',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID scope' },
        bucket: { type: 'string', description: 'Storage bucket (photos, thumbnails, originals, assets)' },
      },
    },
    execute: async (args: any, ctx: any) => {
      const files = await storage.listFiles({
        projectId: args?.projectId || ctx?.projectId,
        bucket: args?.bucket || 'photos',
      });
      return {
        count: files.length,
        files,
      };
    },
  });

  const storage_delete_file = defineTool({
    name: 'storage_delete_file',
    description: 'Delete a file from VM storage and mark its Curator Attachment record as non-existent.',
    mcp: { expose: true },
    accessLevel: 'safe_write',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID scope' },
        bucket: { type: 'string', description: 'Storage bucket (photos, thumbnails, originals, assets)' },
        filename: { type: 'string', description: 'Filename to delete' },
      },
      required: ['filename'],
    },
    execute: async (args: any, ctx: any) => {
      const prisma = ctx?.prisma || storage.prisma;
      return await storage.deleteFile(
        {
          projectId: args.projectId || ctx?.projectId,
          bucket: args.bucket || 'photos',
          filename: String(args.filename),
        },
        prisma
      );
    },
  });

  const plugin: CuratorPlugin = {
    name: 'plugin-storage',
    version: '1.0.0',
    description: 'VM File Storage & Curator Attachment Management Plugin',
    tools: {
      storage_upload_file,
      storage_copy_local_file,
      storage_list_files,
      storage_delete_file,
    },
  };

  return { plugin, storage };
}

