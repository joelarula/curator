import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export type StorageBucket = 'originals' | 'photos' | 'thumbnails' | 'assets' | string;

export interface StorageServiceOptions {
  dataDir?: string;
  baseUrlPrefix?: string;
  defaultProjectId?: string;
  prisma?: any;
}

export interface SaveFileInput {
  projectId?: string;
  bucket?: StorageBucket;
  filename: string;
  data: Buffer | Uint8Array | string;
  encoding?: 'base64' | 'utf-8';
  mimeType?: string;
  resourceId?: number;
  attachmentUri?: string;
}

export interface CopyLocalFileInput {
  sourcePath: string;
  projectId?: string;
  bucket?: StorageBucket;
  filename?: string;
  mimeType?: string;
  resourceId?: number;
  attachmentUri?: string;
}

export interface StoredFileResult {
  projectId: string;
  bucket: string;
  filename: string;
  diskPath: string;
  url: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
  attachmentUri?: string;
}

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
};

export function inferMimeType(filename: string, fallback = 'application/octet-stream'): string {
  const ext = path.extname(filename || '').toLowerCase();
  return MIME_MAP[ext] || fallback;
}

export function sanitizeSegment(segment: string, fallback = 'default'): string {
  const cleaned = String(segment || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_');
  return cleaned || fallback;
}

export class StorageService {
  public readonly dataDir: string;
  public readonly baseUrlPrefix: string;
  public readonly defaultProjectId: string;
  private prismaGetter: () => any;

  constructor(options: StorageServiceOptions = {}) {
    this.dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || './data');
    this.baseUrlPrefix = (options.baseUrlPrefix || '/media').replace(/\/+$/, '');
    this.defaultProjectId = options.defaultProjectId || 'artmoments';
    this.prismaGetter = typeof options.prisma === 'function' ? options.prisma : () => options.prisma;
  }

  public setPrisma(prismaOrGetter: any): void {
    this.prismaGetter = typeof prismaOrGetter === 'function' ? prismaOrGetter : () => prismaOrGetter;
  }

  public get prisma(): any {
    return this.prismaGetter?.();
  }

  public resolveBucketDir(projectId?: string, bucket: StorageBucket = 'photos'): {
    safeProject: string;
    safeBucket: string;
    bucketDir: string;
  } {
    const safeProject = sanitizeSegment(projectId || this.defaultProjectId, this.defaultProjectId);
    const safeBucket = sanitizeSegment(bucket || 'photos', 'photos');
    const bucketDir = path.join(this.dataDir, 'media', safeProject, safeBucket);
    return { safeProject, safeBucket, bucketDir };
  }

  public resolveFilePath(projectId: string | undefined, bucket: StorageBucket, filename: string): {
    safeProject: string;
    safeBucket: string;
    safeFilename: string;
    diskPath: string;
    url: string;
  } {
    const { safeProject, safeBucket, bucketDir } = this.resolveBucketDir(projectId, bucket);
    const safeFilename = sanitizeSegment(path.basename(filename), `file_${Date.now()}`);
    const diskPath = path.join(bucketDir, safeFilename);
    const url = `${this.baseUrlPrefix}/${encodeURIComponent(safeProject)}/${encodeURIComponent(safeBucket)}/${encodeURIComponent(safeFilename)}`;
    return { safeProject, safeBucket, safeFilename, diskPath, url };
  }

  public async ensureBucketDir(projectId?: string, bucket: StorageBucket = 'photos'): Promise<string> {
    const { bucketDir } = this.resolveBucketDir(projectId, bucket);
    await fsp.mkdir(bucketDir, { recursive: true });
    return bucketDir;
  }

  public async saveFile(input: SaveFileInput, overridePrisma?: any): Promise<StoredFileResult> {
    const { safeProject, safeBucket, safeFilename, diskPath, url } = this.resolveFilePath(
      input.projectId,
      input.bucket || 'photos',
      input.filename
    );
    await fsp.mkdir(path.dirname(diskPath), { recursive: true });

    let buffer: Buffer;
    if (Buffer.isBuffer(input.data)) {
      buffer = input.data;
    } else if (input.data instanceof Uint8Array) {
      buffer = Buffer.from(input.data);
    } else if (typeof input.data === 'string') {
      const raw = input.data.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(raw, input.encoding || 'base64');
    } else {
      throw new Error('Invalid file data provided to StorageService.saveFile');
    }

    await fsp.writeFile(diskPath, buffer);
    const mimeType = input.mimeType || inferMimeType(safeFilename);
    const size = buffer.byteLength;

    const attachment = await this.upsertAttachment(
      {
        projectId: safeProject,
        bucket: safeBucket,
        filename: safeFilename,
        url,
        mimeType,
        size,
        resourceId: input.resourceId,
        attachmentUri: input.attachmentUri,
      },
      overridePrisma
    );

    return {
      projectId: safeProject,
      bucket: safeBucket,
      filename: safeFilename,
      diskPath,
      url,
      mimeType,
      size,
      attachmentId: attachment?.id,
      attachmentUri: attachment?.uri,
    };
  }

  public async copyLocalFile(input: CopyLocalFileInput, overridePrisma?: any): Promise<StoredFileResult> {
    if (!fs.existsSync(input.sourcePath)) {
      throw new Error(`Source file does not exist: ${input.sourcePath}`);
    }
    const targetName = input.filename || path.basename(input.sourcePath);
    const { safeProject, safeBucket, safeFilename, diskPath, url } = this.resolveFilePath(
      input.projectId,
      input.bucket || 'photos',
      targetName
    );
    await fsp.mkdir(path.dirname(diskPath), { recursive: true });
    await fsp.copyFile(input.sourcePath, diskPath);
    const stat = await fsp.stat(diskPath);
    const mimeType = input.mimeType || inferMimeType(safeFilename);

    const attachment = await this.upsertAttachment(
      {
        projectId: safeProject,
        bucket: safeBucket,
        filename: safeFilename,
        url,
        mimeType,
        size: stat.size,
        resourceId: input.resourceId,
        attachmentUri: input.attachmentUri,
      },
      overridePrisma
    );

    return {
      projectId: safeProject,
      bucket: safeBucket,
      filename: safeFilename,
      diskPath,
      url,
      mimeType,
      size: stat.size,
      attachmentId: attachment?.id,
      attachmentUri: attachment?.uri,
    };
  }

  public async registerExistingDiskFile(
    input: {
      projectId?: string;
      bucket: StorageBucket;
      filename: string;
      mimeType?: string;
      resourceId?: number;
      attachmentUri?: string;
    },
    overridePrisma?: any
  ): Promise<StoredFileResult> {
    const { safeProject, safeBucket, safeFilename, diskPath, url } = this.resolveFilePath(
      input.projectId,
      input.bucket,
      input.filename
    );
    const stat = await fsp.stat(diskPath);
    const mimeType = input.mimeType || inferMimeType(safeFilename);
    const attachment = await this.upsertAttachment(
      {
        projectId: safeProject,
        bucket: safeBucket,
        filename: safeFilename,
        url,
        mimeType,
        size: stat.size,
        resourceId: input.resourceId,
        attachmentUri: input.attachmentUri,
      },
      overridePrisma
    );
    return {
      projectId: safeProject,
      bucket: safeBucket,
      filename: safeFilename,
      diskPath,
      url,
      mimeType,
      size: stat.size,
      attachmentId: attachment?.id,
      attachmentUri: attachment?.uri,
    };
  }

  public async upsertAttachment(
    params: {
      projectId: string;
      bucket: string;
      filename: string;
      url: string;
      mimeType: string;
      size: number;
      resourceId?: number;
      attachmentUri?: string;
    },
    overridePrisma?: any
  ): Promise<{ id: string; uri: string } | null> {
    const db = overridePrisma || this.prisma;
    if (!db?.attachment) return null;

    const uri =
      params.attachmentUri || `attachment:${params.projectId}:${params.bucket}:${params.filename}`;

    try {
      const record = await db.attachment.upsert({
        where: { uri },
        update: {
          filename: params.filename,
          mimetype: params.mimeType,
          url: params.url,
          size: params.size,
          existent: true,
          ...(params.resourceId !== undefined ? { resourceId: params.resourceId } : {}),
        },
        create: {
          uri,
          filename: params.filename,
          mimetype: params.mimeType,
          url: params.url,
          size: params.size,
          existent: true,
          ...(params.resourceId !== undefined ? { resourceId: params.resourceId } : {}),
        },
      });
      return { id: record.id, uri: record.uri };
    } catch {
      return null;
    }
  }

  public async listFiles(options: { projectId?: string; bucket?: StorageBucket } = {}): Promise<StoredFileResult[]> {
    const { safeProject, safeBucket, bucketDir } = this.resolveBucketDir(
      options.projectId,
      options.bucket || 'photos'
    );
    if (!fs.existsSync(bucketDir)) return [];
    const entries = await fsp.readdir(bucketDir, { withFileTypes: true });
    const results: StoredFileResult[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const diskPath = path.join(bucketDir, entry.name);
      const stat = await fsp.stat(diskPath);
      const url = `${this.baseUrlPrefix}/${encodeURIComponent(safeProject)}/${encodeURIComponent(safeBucket)}/${encodeURIComponent(entry.name)}`;
      results.push({
        projectId: safeProject,
        bucket: safeBucket,
        filename: entry.name,
        diskPath,
        url,
        mimeType: inferMimeType(entry.name),
        size: stat.size,
      });
    }
    return results;
  }

  public async deleteFile(
    options: {
      projectId?: string;
      bucket?: StorageBucket;
      filename: string;
      attachmentUri?: string;
    },
    overridePrisma?: any
  ): Promise<{ deletedDisk: boolean; deletedAttachment: boolean }> {
    const { safeProject, safeBucket, safeFilename, diskPath } = this.resolveFilePath(
      options.projectId,
      options.bucket || 'photos',
      options.filename
    );
    let deletedDisk = false;
    if (fs.existsSync(diskPath)) {
      await fsp.unlink(diskPath);
      deletedDisk = true;
    }

    let deletedAttachment = false;
    const db = overridePrisma || this.prisma;
    if (db?.attachment) {
      const uri = options.attachmentUri || `attachment:${safeProject}:${safeBucket}:${safeFilename}`;
      try {
        await db.attachment.updateMany({
          where: { uri },
          data: { existent: false },
        });
        deletedAttachment = true;
      } catch {}
    }

    return { deletedDisk, deletedAttachment };
  }
}

